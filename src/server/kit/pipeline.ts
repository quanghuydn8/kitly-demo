// Kit Pipeline (PRD "Kit Pipeline"): Planner → (clarify if no budget, D32) → Matcher → Optimizer → Explainer, as the
// CONTRACT §3 SSE event sequence. New kit: creates the thread, records the intent session + demand items (once per
// thread) and saves version 1. Refine (ticket 04): the refine planner revises the thread's latest plan, code removes
// excluded items and computes the PlanDiff, records an intent session but NO demand items, and appends a `refine`
// version. Every version is saved BEFORE `done`. Errors before `options` become one `error` event; after `options`
// an explainer failure only ends the explain step ("Explanation unavailable").
// Ticket 16 (D39–D46): the thread's persona feeds listVouchers (wallet savings) and getPersona → 💛 interests on every
// option, a SalesContext for the Explainer and a follow-up question generated IN PARALLEL with the Explainer, sent as
// `followup` after the explanation and before `done` (saved on the version). Refine intent "answer" (D42) = an answer
// turn: a fast-model answer stream + follow-up, saved as a KitMessage; no new version, no intent session, no demand.
import type {
  BasketOption,
  CommerceAdapter,
  KitPlan,
  KitStore,
  KitThreadSummary,
  KitVersion,
  Persona,
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
import { withInterests } from "./interests";
import { buildSalesContext } from "./sales-context";
import { followUp } from "./follow-up";
import { answerUnavailable, streamAnswer } from "./answer";
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
  private marks: [string, number, string?][] = [];
  private t0 = performance.now();
  private last = this.t0;
  lap(step: string) {
    const now = performance.now();
    this.marks.push([step, now - this.last]);
    this.last = now;
  }
  /** A step that ran in parallel with the others (the follow-up): its own duration + a note, e.g. "(llm)". */
  side(step: string, ms: number, note: string) {
    this.marks.push([step, ms, note]);
  }
  line() {
    // sequential steps first, then the parallel ones: "… explain 1.1s followup 0.9s (llm) total 5.0s"
    const ordered = [...this.marks.filter((m) => !m[2]), ...this.marks.filter((m) => m[2])];
    const parts = ordered.map(([s, ms, note]) => `${s} ${(ms / 1000).toFixed(1)}s${note ? ` (${note})` : ""}`);
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
  /** Shops + this persona's vouchers + the persona, loaded while the planner thinks. */
  world: Promise<World>;
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
  const [shops, vouchers, persona] = await ctx.world;
  const match = await matchPlan(adapter, plan, { shops, today });
  const recorded = ctx.recordDemand ? adapter.recordDemandItems(sessionId, demandRows(plan, match)) : Promise.resolve();
  timer.lap("search");
  emit({
    event: "step",
    data: { id: "search", status: "done", detail: `Compared ${match.compared.products} products from ${match.compared.shops} shops` },
  });

  emit({ event: "step", data: { id: "optimize", status: "running" } });
  const options: BasketOption[] = withInterests(
    optimize({ plan, candidates: match.candidates, noMatch: match.noMatch, shops, vouchers, today }, profiles),
    plan,
    match.pool,
    persona,
    vouchers,
    today,
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
  const sales = buildSalesContext(plan, chosen ?? null, persona, vouchers, today, shops);
  // started before the explainer stream and awaited after it: total ≈ max(explainer, follow-up), not the sum
  const followUpDone = timedFollowUp(ctx, { plan, option: chosen ?? null, context: sales, lastMessage: base.userText, vouchers });
  let explanation = "";
  let explainFailed = false;
  try {
    for await (const delta of streamExplanation(llm, plan, chosen, signal, ctx.changes, sales)) {
      explanation += delta;
      emit({ event: "explanation", data: { delta } });
    }
  } catch (err) {
    explainFailed = true;
    console.warn(`[kit] explainer failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  timer.lap("explain");
  const fu = await followUpDone;
  const saved = await store.appendVersion({ ...base, status: "ready", options, explanation: explanation.trim(), followUp: fu }, owner);
  emit({
    event: "step",
    data: explainFailed ? { id: "explain", status: "done", detail: "Explanation unavailable" } : { id: "explain", status: "done" },
  });
  emit({ event: "followup", data: { followUp: fu } });
  emit({ event: "done", data: { sessionId, threadId: base.threadId, version: saved.version } });
  console.info(timer.line());
}

type World = [Shop[], Voucher[], Persona];

/** The follow-up for this turn (never throws), with its own line in the timing log: `followup 1.2s (llm)`. */
function timedFollowUp(ctx: { deps: KitDeps; timer: Timer }, input: Parameters<typeof followUp>[1]) {
  const t0 = performance.now();
  return followUp(ctx.deps.llm, input).then((f) => {
    ctx.timer.side("followup", performance.now() - t0, f.source);
    return f;
  });
}

function loadWorld(adapter: CommerceAdapter, persona: PersonaId): Promise<World> {
  const world = Promise.all([adapter.listShops(), adapter.listVouchers(persona), adapter.getPersona(persona)]);
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
 * Answer turn (D42): the latest version stays as it is. Stream: step understand done ("Answering") → explanation
 * deltas (the answer) → followup → done { sessionId: null, version unchanged, answered: true }; the KitMessage is
 * saved before done. No recordIntent, no demand items, no new version.
 */
async function answerTurn(
  deps: KitDeps,
  req: RefineRequest,
  latest: KitVersion,
  world: Promise<World>,
  timer: Timer,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  const { thread } = req.thread;
  const plan = latest.plan;
  emit({ event: "step", data: { id: "understand", status: "done", detail: "Answering" } });
  const [shops, vouchers, persona] = await world;
  const option = latest.options.find((o) => o.profile === "balanced") ?? latest.options[0] ?? null;
  const sales = buildSalesContext(plan, option, persona, vouchers, deps.today, shops);
  const followUpDone = timedFollowUp({ deps, timer }, { plan, option, context: sales, lastMessage: req.message, vouchers });
  let answer = "";
  try {
    for await (const delta of streamAnswer(deps.llm, { plan, option, sales, message: req.message }, signal)) {
      answer += delta;
      emit({ event: "explanation", data: { delta } });
    }
  } catch (err) {
    console.warn(`[kit] answer failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!answer.trim()) {
    answer = answerUnavailable(plan.language);
    emit({ event: "explanation", data: { delta: answer } });
  }
  timer.lap("answer");
  const fu = await followUpDone;
  await deps.store.appendMessage(
    { threadId: thread.id, afterVersion: latest.version, userText: req.message, answer: answer.trim(), followUp: fu },
    req.owner,
  );
  emit({ event: "followup", data: { followUp: fu } });
  emit({ event: "done", data: { sessionId: null, threadId: thread.id, version: latest.version, answered: true } });
  console.info(timer.line());
}

/**
 * POST /api/kit/refine: the latest version's plan + the message → revised plan → a new `refine` version, or an
 * answer turn when the refine planner says intent "answer" (D42). Never throws.
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
    const { intent, plan } = await refineKit(deps.llm, { previous, message: req.message, excluded }, { today: deps.today });
    timer.lap("understand");
    if (intent === "answer") return answerTurn(deps, req, latest, world, timer, emit, signal);
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
