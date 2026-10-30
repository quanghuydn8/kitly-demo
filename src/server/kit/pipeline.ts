// Kit Pipeline (PRD "Kit Pipeline"): Planner → (clarify if no budget, D32) → Matcher → Optimizer → Explainer, as the
// CONTRACT §3 SSE event sequence. Creates the thread, records the intent session + demand items (once per thread) and
// saves version 1 in the KitStore BEFORE `done`. Errors before `options` become one `error` event; after `options`
// an explainer failure only ends the explain step ("Explanation unavailable").
// Follow-up / interests / persona-aware explainer = ticket 16 (followUp: null here).
import type {
  BasketOption,
  CommerceAdapter,
  KitPlan,
  KitStore,
  PersonaId,
  Profile,
} from "@/contract";
import { EVENTS } from "@/contract";
import type { LLMClient } from "@/server/llm";
import { formatVnd, optimize } from "@/server/optimizer";
import { matchPlan, type MatchResult } from "./matcher";
import { planKit, PlannerError } from "./planner";
import { streamExplanation } from "./explainer";
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

/** POST /api/kit: a new thread + version 1. Never throws: failures end the stream with an `error` event. */
export async function runNewKit(deps: KitDeps, req: NewKitRequest, emit: Emit, signal?: AbortSignal): Promise<void> {
  const { adapter, store, llm, today } = deps;
  const profiles = req.profiles?.length ? req.profiles : ALL_PROFILES;
  const timer = new Timer();
  let optionsSent = false;
  try {
    emit({ event: "step", data: { id: "understand", status: "running" } });
    // Marketplace context for this thread's persona, loaded while the planner thinks.
    const world = Promise.all([adapter.listShops(), adapter.listVouchers(req.persona), adapter.getPersona(req.persona)]);
    world.catch(() => {}); // awaited below; avoid an unhandled rejection if the planner fails first
    const plan = await planKit(llm, req.query, { today });
    timer.lap("understand");
    emit({ event: "step", data: { id: "understand", status: "done", detail: understoodDetail(plan) } });

    emit({ event: "step", data: { id: "plan", status: "running" } });
    const { threadId } = await store.createThread(req.owner, req.query, req.persona);
    const { sessionId } = await adapter.recordIntent({ query: req.query, plan, source: "live" });
    emit({ event: "plan", data: { sessionId, threadId, version: 1, plan } });
    emit({ event: "step", data: { id: "plan", status: "done", detail: `Planned ${plan.items.length} items` } });
    const base = { threadId, kind: "new" as const, userText: req.query, plan, excludedKeys: [], diff: null, selection: null, followUp: null };

    if (plan.budget === null) {
      const text = clarifyText(plan.language);
      const saved = await store.appendVersion({ ...base, status: "awaiting_budget", options: [], explanation: "" }, req.owner);
      emit({ event: "clarify", data: { threadId, version: saved.version, question: { kind: "budget", text, choices: BUDGET_CHOICES } } });
      emit({ event: "done", data: { sessionId, threadId, version: saved.version } });
      console.info(timer.line());
      return;
    }

    emit({ event: "step", data: { id: "search", status: "running" } });
    const [shops, vouchers] = await world;
    const match = await matchPlan(adapter, plan, { shops, today });
    // Demand items: once per thread, on the first run that produces options (CONTRACT §3).
    const recorded = adapter.recordDemandItems(sessionId, demandRows(plan, match));
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
    optionsSent = true;

    emit({ event: "step", data: { id: "explain", status: "running" } });
    const chosen = options.find((o) => o.profile === "balanced") ?? options[0];
    let explanation = "";
    let explainFailed = false;
    try {
      for await (const delta of streamExplanation(llm, plan, chosen, signal)) {
        explanation += delta;
        emit({ event: "explanation", data: { delta } });
      }
    } catch (err) {
      explainFailed = true;
      console.warn(`[kit] explainer failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    timer.lap("explain");
    const saved = await store.appendVersion({ ...base, status: "ready", options, explanation: explanation.trim() }, req.owner);
    emit({
      event: "step",
      data: explainFailed
        ? { id: "explain", status: "done", detail: "Explanation unavailable" }
        : { id: "explain", status: "done" },
    });
    emit({ event: "done", data: { sessionId, threadId, version: saved.version } });
    console.info(timer.line());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kit] failed${optionsSent ? " after options" : ""}: ${message}`);
    const code = err instanceof PlannerError ? err.code : "internal_error";
    emit({
      event: "error",
      data: { code, message: code === "llm_error" ? "Kitly could not understand the request right now. Please retry." : message },
    });
  }
}
