// Kit Pipeline (PRD "Kit Pipeline", seam S2): Planner → Matcher → Optimizer → Explainer as CONTRACT.md §3 SSE events.
// Records the intent session + one demand item per plan item through the adapter. Every failure ends the stream
// with a terminal `error` event (code llm_error for model failures, internal otherwise) — never a hung stream.
import type {
  BasketOption,
  CommerceAdapter,
  KitPlan,
  KitSseEvent,
  Profile,
} from "@/contract";
import type { LLM } from "@/server/llm";
import { optimize, type NoMatchReason } from "@/server/optimizer";
import { formatVnd } from "@/server/optimizer/present";
import { explainKit, primaryOption } from "./explainer";
import { matchPlan, type PlanMatch } from "./matcher";
import { planKit } from "./planner";
import { diffPlans } from "./plan-diff";

export interface KitDeps {
  adapter: CommerceAdapter;
  llm: LLM;
  today: string;
}

/** Model call failed (network, proxy, schema). Mapped to error code "llm_error". */
export class LLMCallError extends Error {}

async function llmCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new LLMCallError(e instanceof Error ? e.message : String(e));
  }
}

const step = (id: "understand" | "plan" | "search" | "optimize" | "explain", status: "running" | "done", detail?: string): KitSseEvent => ({
  event: "step",
  data: detail === undefined ? { id, status } : { id, status, detail },
});

function understandDetail(plan: KitPlan): string {
  const ev = plan.event.replace(/_/g, " ");
  const parts = [ev.charAt(0).toUpperCase() + ev.slice(1)];
  parts.push(plan.budget === null ? "no budget set" : `budget ${formatVnd(plan.budget)}`);
  if (plan.deadline) {
    const d = new Date(`${plan.deadline}T00:00:00.000Z`);
    parts.push(`by ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`);
  }
  return parts.join(" · ");
}

function optimizeDetail(o: BasketOption): string {
  if (o.status === "over_budget") return `Over budget: minimum ${formatVnd(o.minimumCost ?? o.grandTotal)}`;
  return `Optimized: ${formatVnd(o.grandTotal)} across ${o.shops.length} shop${o.shops.length === 1 ? "" : "s"}`;
}

/** Demand budget hint: the buyer's per-unit cap, else an even per-unit share of the budget (rounded to 1,000₫). */
function budgetHints(plan: KitPlan): Map<string, number | null> {
  const units = plan.items.reduce((s, i) => s + i.quantity, 0);
  const share = plan.budget === null || units === 0 ? null : Math.round(plan.budget / units / 1000) * 1000;
  return new Map(plan.items.map((i) => [i.key, i.maxUnitPrice ?? share]));
}

export interface PlanSource {
  /** Produces the plan (Planner for /api/kit; refine passes its own). */
  makePlan: () => Promise<KitPlan>;
  /** Records the session for this plan, returns its id. */
  record: (plan: KitPlan) => Promise<string>;
  /** Refine only: the plan being revised → `plan.diff` + the explainer is told what changed. */
  previous?: KitPlan;
  /** Record one demand row per plan item (default true). Refine passes false: the session is kept, demand is not (F3). */
  logDemand?: boolean;
}

/** Shared body of /api/kit and /api/kit/refine: plan → match → optimize → explain. */
export async function* kitStream(src: PlanSource, profiles: Profile[], deps: KitDeps): AsyncGenerator<KitSseEvent> {
  try {
    yield step("understand", "running");
    const plan = await llmCall(src.makePlan);
    yield step("understand", "done", understandDetail(plan));

    yield step("plan", "running");
    const sessionId = await src.record(plan);
    yield step("plan", "done", `Planned ${plan.items.length} item${plan.items.length === 1 ? "" : "s"}`);
    const diff = src.previous ? diffPlans(src.previous, plan) : undefined;
    yield { event: "plan", data: diff ? { sessionId, plan, diff } : { sessionId, plan } };

    yield step("search", "running");
    const match: PlanMatch = await matchPlan(deps.adapter, plan, deps.today);
    const hints = budgetHints(plan);
    if (src.logDemand !== false)
      await deps.adapter.recordDemandItems(
        sessionId,
        plan.items.map((item) => ({
          item,
          matchedCount: match.byItem[item.key].candidates.length,
          budgetHint: hints.get(item.key) ?? null,
        })),
      );
    yield step("search", "done", `Compared ${match.productsCompared} products from ${match.shopsCompared} shops`);

    yield step("optimize", "running");
    const [shops, vouchers] = await Promise.all([deps.adapter.listShops(), deps.adapter.listVouchers()]);
    const candidates = Object.fromEntries(plan.items.map((i) => [i.key, match.byItem[i.key].candidates]));
    const noMatchReasons: Record<string, NoMatchReason> = {};
    for (const i of plan.items) {
      const r = match.byItem[i.key].reason;
      if (r) noMatchReasons[i.key] = r;
    }
    const options = profiles.map((profile) =>
      optimize({ plan, candidates, noMatchReasons, shops, vouchers, profile, today: deps.today }),
    );
    yield step("optimize", "done", optimizeDetail(primaryOption(options)));
    yield { event: "options", data: { options } };

    yield step("explain", "running");
    const deltas = explainKit(deps.llm, plan, options, src.previous && diff ? { previous: src.previous, diff } : undefined);
    for (;;) {
      const next = await llmCall(() => deltas.next());
      if (next.done) break;
      if (next.value) yield { event: "explanation", data: { delta: next.value } };
    }
    yield step("explain", "done");
    yield { event: "done", data: { sessionId } };
  } catch (e) {
    console.error("[kit] pipeline failed:", e);
    const message = e instanceof Error ? e.message : "Unexpected error";
    yield { event: "error", data: { code: e instanceof LLMCallError ? "llm_error" : "internal", message } };
  }
}

const DEFAULT_PROFILES: Profile[] = ["balanced"];

export function normalizeProfiles(p: Profile[] | undefined): Profile[] {
  const list = [...new Set(p ?? [])];
  return list.length > 0 ? list : DEFAULT_PROFILES;
}

/** POST /api/kit: need sentence → events. */
export function runKit(input: { query: string; profiles?: Profile[] }, deps: KitDeps): AsyncGenerator<KitSseEvent> {
  return kitStream(
    {
      makePlan: () => planKit(deps.llm, input.query, deps.today),
      record: async (plan) => (await deps.adapter.recordIntent({ query: input.query, plan, source: "live" })).sessionId,
    },
    normalizeProfiles(input.profiles),
    deps,
  );
}
