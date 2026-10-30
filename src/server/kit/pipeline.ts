// Kit Pipeline (PRD "Kit Pipeline"): Planner → (clarify if no budget, D32) → Matcher → Optimizer → Explainer, as the
// CONTRACT §3 SSE event sequence. New kit: creates the thread, records the intent session + demand items (once per
// thread) and saves version 1. Refine (ticket 04): the refine planner revises the thread's latest plan, code removes
// excluded items and computes the PlanDiff, records an intent session but NO demand items, and appends a `refine`
// version. Every version is saved BEFORE `done`. Errors before `options` become one `error` event; after `options`
// an explainer failure only ends the explain step ("Explanation unavailable").
// Follow-up / interests / persona-aware explainer = ticket 16 (followUp: null here).
import type {
  BasketOption,
  CommerceAdapter,
  KitPlan,
  KitStore,
  KitThreadSummary,
  KitVersion,
  PersonaId,
  Profile,
  Shop,
  Voucher,
} from "@/contract";
import { EVENTS } from "@/contract";
import type { LLMClient } from "@/server/llm";
import { formatVnd, optimize } from "@/server/optimizer";
import { matchPlan, type MatchResult } from "./matcher";
import { planKit, PlannerError } from "./planner";
import { streamExplanation, type ExplainChanges } from "./explainer";
import { refineKit, type ExcludedItems } from "./refine-planner";
import { diffPlans } from "./diff";
import type { Emit } from "./sse";

export const ALL_PROFILES: Profile[] = ["saver", "balanced", "premium"];
export const BUDGET_CHOICES: (number | null)[] = [500_000, 1_000_000, 2_000_000, null];

export interface KitDeps {
  adapter: CommerceAdapter;
  store: KitStore;
  llm: LLMClient;
  today: string;
}
export interface NewKitRequest {
  owner: string;
  persona: PersonaId;
  query: string;
  profiles?: Profile[];
}

export interface RefineRequest {
  owner: string;
  /** The caller's thread, loaded (and owner-checked) by the route before the stream starts. */
  thread: { thread: KitThreadSummary; versions: KitVersion[] };
  message: string;
  profiles?: Profile[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

function understoodDetail(plan: KitPlan): string {
  const event = plan.event === "other" ? "Other" : EVENTS[plan.event].label;
  const budget = plan.budget === null ? "no budget" : `budget ${formatVnd(plan.budget)}`;
  return [event, budget, plan.deadline ? `by ${shortDate(plan.deadline)}` : null].filter(Boolean).join(" · ");
}

export function clarifyText(language: KitPlan["language"]): string {
  return language === "vi" ? "Ngân sách của bạn khoảng bao nhiêu?" : "What's your budget?";
}

/** demand_items.budget_hint = the item's maxUnitPrice, else its even share of the budget (rounded to 1,000₫). */
function budgetHint(plan: KitPlan, maxUnitPrice: number | null): number | null {
  if (maxUnitPrice !== null) return maxUnitPrice;
  if (plan.budget === null || !plan.items.length) return null;
  return Math.round(plan.budget / plan.items.length / 1000) * 1000;
}

export function demandRows(plan: KitPlan, match: Pick<MatchResult, "matchedCount">) {
  return plan.items.map((item) => ({
    item,
    matchedCount: match.matchedCount[item.key] ?? 0,
    budgetHint: budgetHint(plan, item.maxUnitPrice),
  }));
}

class Timer {
  private marks: [string, number][] = [];
  private t0 = performance.now();
  private last = this.t0;
  lap(step: string) {
    const now = performance.now();
    this.marks.push([step, now - this.last]);
    this.last = now;
  }
  line() {
    const parts = this.marks.map(([s, ms]) => `${s} ${(ms / 1000).toFixed(1)}s`);
    return `[kit] ${parts.join(" ")} total ${((performance.now() - this.t0) / 1000).toFixed(1)}s`;
  }
}

type VersionBase = Pick<KitVersion, "threadId" | "kind" | "userText" | "plan" | "excludedKeys" | "diff" | "selection" | "followUp">;

/** Everything after the `plan` event, shared by new kits and refines. */
interface RunContext {
  deps: KitDeps;
  owner: string;
  persona: PersonaId;
  profiles: Profile[];
  sessionId: string;
  base: VersionBase;
  /** Demand items are recorded once per thread: on the new kit's first options, never on refine (CONTRACT §3). */
  recordDemand: boolean;
  changes?: ExplainChanges;
  /** Shops + this persona's vouchers, loaded while the planner thinks. */
  world: Promise<[Shop[], Voucher[]]>;
  timer: Timer;
  state: { optionsSent: boolean };
}

async function clarifyAndSave(ctx: RunContext, emit: Emit): Promise<void> {
  const { base, sessionId, owner, deps } = ctx;
  const text = clarifyText(base.plan.language);
  const saved = await deps.store.appendVersion({ ...base, status: "awaiting_budget", options: [], explanation: "" }, owner);
  emit({ event: "clarify", data: { threadId: base.threadId, version: saved.version, question: { kind: "budget", text, choices: BUDGET_CHOICES } } });
  emit({ event: "done", data: { sessionId, threadId: base.threadId, version: saved.version } });
  console.info(ctx.timer.line());
}

async function optionsExplainAndSave(ctx: RunContext, emit: Emit, signal?: AbortSignal): Promise<void> {
  const { deps, base, sessionId, owner, profiles, timer } = ctx;
  const { adapter, store, llm, today } = deps;
  const plan = base.plan;
  emit({ event: "step", data: { id: "search", status: "running" } });
  const [shops, vouchers] = await ctx.world;
  const match = await matchPlan(adapter, plan, { shops, today });
  const recorded = ctx.recordDemand ? adapter.recordDemandItems(sessionId, demandRows(plan, match)) : Promise.resolve();
  timer.lap("search");
  emit({
    event: "step",
    data: { id: "search", status: "done", detail: `Compared ${match.compared.products} products from ${match.compared.shops} shops` },
  });

  emit({ event: "step", data: { id: "optimize", status: "running" } });
  const options: BasketOption[] = optimize(
    { plan, candidates: match.candidates, noMatch: match.noMatch, shops, vouchers, today },
    profiles,
  );
  await recorded;
  timer.lap("optimize");
  emit({
    event: "step",
    data: { id: "optimize", status: "done", detail: `Built ${options.length} basket${options.length === 1 ? "" : "s"}` },
  });
  emit({ event: "options", data: { options } });
  ctx.state.optionsSent = true;

  emit({ event: "step", data: { id: "explain", status: "running" } });
  const chosen = options.find((o) => o.profile === "balanced") ?? options[0];
  let explanation = "";
  let explainFailed = false;
  try {
    for await (const delta of streamExplanation(llm, plan, chosen, signal, ctx.changes)) {
      explanation += delta;
      emit({ event: "explanation", data: { delta } });
    }
  } catch (err) {
    explainFailed = true;
    console.warn(`[kit] explainer failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  timer.lap("explain");
  const saved = await store.appendVersion({ ...base, status: "ready", options, explanation: explanation.trim() }, owner);
  emit({
    event: "step",
    data: explainFailed ? { id: "explain", status: "done", detail: "Explanation unavailable" } : { id: "explain", status: "done" },
  });
  emit({ event: "done", data: { sessionId, threadId: base.threadId, version: saved.version } });
  console.info(timer.line());
}

function loadWorld(adapter: CommerceAdapter, persona: PersonaId): Promise<[Shop[], Voucher[]]> {
  const world = Promise.all([adapter.listShops(), adapter.listVouchers(persona)]);
  world.catch(() => {}); // awaited later; avoid an unhandled rejection if the planner fails first
  return world;
}

function finishRun(ctx: RunContext, emit: Emit, signal?: AbortSignal): Promise<void> {
  return ctx.base.plan.budget === null ? clarifyAndSave(ctx, emit) : optionsExplainAndSave(ctx, emit, signal);
}

/** Runs one kit stream; any failure becomes the terminal `error` event (never throws). */
async function guarded(emit: Emit, state: { optionsSent: boolean }, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kit] failed${state.optionsSent ? " after options" : ""}: ${message}`);
    const code = err instanceof PlannerError ? err.code : "internal_error";
    emit({
      event: "error",
      data: { code, message: code === "llm_error" ? "Kitly could not understand the request right now. Please retry." : message },
    });
  }
}

/** POST /api/kit: a new thread + version 1. Never throws: failures end the stream with an `error` event. */
export async function runNewKit(deps: KitDeps, req: NewKitRequest, emit: Emit, signal?: AbortSignal): Promise<void> {
  const state = { optionsSent: false };
  const timer = new Timer();
  await guarded(emit, state, async () => {
    emit({ event: "step", data: { id: "understand", status: "running" } });
    const world = loadWorld(deps.adapter, req.persona);
    const plan = await planKit(deps.llm, req.query, { today: deps.today });
    timer.lap("understand");
    emit({ event: "step", data: { id: "understand", status: "done", detail: understoodDetail(plan) } });

    emit({ event: "step", data: { id: "plan", status: "running" } });
    const { threadId } = await deps.store.createThread(req.owner, req.query, req.persona);
    const { sessionId } = await deps.adapter.recordIntent({ query: req.query, plan, source: "live" });
    emit({ event: "plan", data: { sessionId, threadId, version: 1, plan } });
    emit({ event: "step", data: { id: "plan", status: "done", detail: `Planned ${plan.items.length} items` } });
    const base: VersionBase = { threadId, kind: "new", userText: req.query, plan, excludedKeys: [], diff: null, selection: null, followUp: null };
    const profiles = req.profiles?.length ? req.profiles : ALL_PROFILES;
    await finishRun({ deps, owner: req.owner, persona: req.persona, profiles, sessionId, base, recordDemand: true, world, timer, state }, emit, signal);
  });
}

/** Excluded keys of a thread + the categories and labels those items had in any earlier version (D33). */
export function excludedItems(versions: KitVersion[], excludedKeys: string[]): ExcludedItems {
  const keys = new Set(excludedKeys);
  const categories = new Set<string>();
  const labels = new Map<string, string>();
  for (const v of versions) {
    for (const i of v.plan.items) {
      if (!keys.has(i.key)) continue;
      if (i.category !== null) categories.add(i.category);
      labels.set(i.key, i.needLabel);
    }
  }
  return { keys: [...keys], categories: [...categories], labels: [...labels.values()] };
}

/**
 * POST /api/kit/refine: the latest version's plan + the message → revised plan → a new `refine` version.
 * Intent "answer" (D42) is handled as change_kit until ticket 16. Never throws.
 */
export async function runRefine(deps: KitDeps, req: RefineRequest, emit: Emit, signal?: AbortSignal): Promise<void> {
  const state = { optionsSent: false };
  const timer = new Timer();
  await guarded(emit, state, async () => {
    const { thread, versions } = req.thread;
    const latest = versions.at(-1);
    if (!latest) throw new Error(`thread ${thread.id} has no version`);
    const previous = latest.plan;
    emit({ event: "step", data: { id: "understand", status: "running" } });
    const world = loadWorld(deps.adapter, thread.persona);
    const excluded = excludedItems(versions, latest.excludedKeys);
    const { plan } = await refineKit(deps.llm, { previous, message: req.message, excluded }, { today: deps.today });
    timer.lap("understand");
    emit({ event: "step", data: { id: "understand", status: "done", detail: understoodDetail(plan) } });

    emit({ event: "step", data: { id: "plan", status: "running" } });
    const diff = diffPlans(previous, plan);
    // A new intent session so the buyer can refine again — but no demand items: same need, not new demand.
    const { sessionId } = await deps.adapter.recordIntent({ query: req.message, plan, source: "live" });
    emit({ event: "plan", data: { sessionId, threadId: thread.id, version: latest.version + 1, plan, diff } });
    emit({ event: "step", data: { id: "plan", status: "done", detail: `Planned ${plan.items.length} items` } });
    const base: VersionBase = {
      threadId: thread.id,
      kind: "refine",
      userText: req.message,
      plan,
      excludedKeys: [...latest.excludedKeys],
      diff,
      selection: null,
      followUp: null,
    };
    const profiles = req.profiles?.length ? req.profiles : ALL_PROFILES;
    await finishRun(
      { deps, owner: req.owner, persona: thread.persona, profiles, sessionId, base, recordDemand: false, changes: { previous, diff }, world, timer, state },
      emit,
      signal,
    );
  });
}
