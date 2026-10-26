// Planner eval (PRD seam S8, `npm run eval`): runs the real planner on 6 event queries + 3 off-coverage queries and
// checks the plans. Costs tokens → never part of npm test; tests drive the same code with FakeLLM.
import { CATEGORIES, type EventType, type KitPlan } from "@/contract";
import { planKit } from "@/server/kit/planner";
import type { LLM } from "@/server/llm";

export type EvalCase =
  | { kind: "event"; event: Exclude<EventType, "other">; language: "en" | "vi"; query: string }
  /** `tolerated`: categories that are a plausible (not wrong) fit for this off-coverage need; anything else is wrong. */
  | { kind: "off"; language: "en" | "vi"; query: string; tolerated: string[] };

export const EVAL_CASES: EvalCase[] = [
  {
    kind: "event",
    event: "back_to_school",
    language: "en",
    query:
      "My son starts Grade 1 on Sept 5, need everything for school under 1.5M, backpack must be anti-hunchback",
  },
  {
    kind: "event",
    event: "newborn",
    language: "vi",
    query: "Vợ mình sắp sinh em bé tháng sau, cần chuẩn bị đồ sơ sinh, ngân sách khoảng 3 triệu",
  },
  {
    kind: "event",
    event: "first_apartment",
    language: "en",
    query: "Moving into my first apartment next week, need the basics for the kitchen and bedroom, budget 4M",
  },
  {
    kind: "event",
    event: "camping_trip",
    language: "vi",
    query: "Cuối tuần này đi cắm trại 2 ngày 1 đêm ở Đà Lạt cho 2 người, cần mua đồ cắm trại dưới 3 triệu",
  },
  {
    kind: "event",
    event: "home_office",
    language: "en",
    query: "Setting up a home office to work remotely full time, budget 8M",
  },
  {
    kind: "event",
    event: "tet_gifts",
    language: "vi",
    query: "Mua quà Tết biếu sếp và bố mẹ hai bên, tổng khoảng 2 triệu",
  },
  { kind: "off", language: "en", query: "adopting a puppy", tolerated: ["storage-boxes"] },
  {
    kind: "off",
    language: "en",
    query: "planning a wedding",
    tolerated: ["wine", "gift-basket", "red-envelopes", "cookie-tin", "tea-gift-box", "coffee-gift-set"],
  },
  {
    kind: "off",
    language: "en",
    query: "learning guitar",
    tolerated: ["desk-lamp", "headset", "storage-boxes"],
  },
];

export const MIN_ITEMS = 5;
export const MIN_IN_EVENT_SHARE = 0.7;
export const MIN_NULL_SHARE = 0.5;

export interface PlanCheck {
  pass: boolean;
  failures: string[];
  itemCount: number;
  planEvent: EventType | null;
  /** event cases: share of items whose category belongs to the expected event (null categories count against). */
  inEventShare: number | null;
  /** off cases: share of items with category null. */
  nullShare: number | null;
  /** off cases: non-null categories outside the case's tolerated list. */
  wrongCategories: string[];
}

const eventOf = new Map(CATEGORIES.map((c) => [c.id, c.event]));
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function checkPlan(c: EvalCase, plan: KitPlan): PlanCheck {
  const n = plan.items.length;
  const failures: string[] = [];
  const base = {
    itemCount: n,
    planEvent: plan.event,
    inEventShare: null,
    nullShare: null,
    wrongCategories: [],
  };
  if (c.kind === "event") {
    const share =
      n === 0 ? 0 : plan.items.filter((i) => i.category && eventOf.get(i.category) === c.event).length / n;
    if (n < MIN_ITEMS) failures.push(`${n} items, need ≥ ${MIN_ITEMS} items`);
    if (share < MIN_IN_EVENT_SHARE)
      failures.push(`${pct(share)} in ${c.event}, need ≥ ${pct(MIN_IN_EVENT_SHARE)}`);
    return { ...base, pass: failures.length === 0, failures, inEventShare: share };
  }
  const nullShare = n === 0 ? 0 : plan.items.filter((i) => i.category === null).length / n;
  const wrong = plan.items.flatMap((i) =>
    i.category && !c.tolerated.includes(i.category) ? [i.category] : [],
  );
  if (n === 0) failures.push("empty plan");
  if (nullShare < MIN_NULL_SHARE) failures.push(`${pct(nullShare)} null, need ≥ ${pct(MIN_NULL_SHARE)}`);
  if (wrong.length > 0) failures.push(`wrong-event categories: ${wrong.join(", ")}`);
  return { ...base, pass: failures.length === 0, failures, nullShare, wrongCategories: wrong };
}

export interface EvalResult extends PlanCheck {
  case: EvalCase;
  latencyMs: number;
  plan: KitPlan | null;
}

/** Sequential on purpose: latency per call is reported, and parallel calls through a proxy would skew it. */
export async function runPlannerEval(
  llm: LLM,
  opts: { today: string; cases?: EvalCase[]; onResult?: (r: EvalResult) => void },
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const c of opts.cases ?? EVAL_CASES) {
    const t0 = performance.now();
    let r: EvalResult;
    try {
      const plan = await planKit(llm, c.query, opts.today);
      r = { case: c, latencyMs: performance.now() - t0, plan, ...checkPlan(c, plan) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = {
        case: c,
        latencyMs: performance.now() - t0,
        plan: null,
        pass: false,
        failures: [`planner error: ${msg}`],
        itemCount: 0,
        planEvent: null,
        inEventShare: null,
        nullShare: null,
        wrongCategories: [],
      };
    }
    opts.onResult?.(r);
    results.push(r);
  }
  return results;
}

const expected = (c: EvalCase) => (c.kind === "event" ? c.event : "off-coverage");
const ms = (x: number) => `${Math.round(x)} ms`;

export function formatEvalTable(results: EvalResult[]): string {
  const rows = results.map((r) => [
    r.pass ? "PASS" : "FAIL",
    expected(r.case),
    r.case.language,
    r.planEvent ?? "-",
    String(r.itemCount),
    r.inEventShare !== null
      ? `${pct(r.inEventShare)} in event`
      : r.nullShare !== null
        ? `${pct(r.nullShare)} null`
        : "-",
    ms(r.latencyMs),
    r.case.query,
    r.failures.join("; "),
  ]);
  const head = ["result", "expected", "lang", "plan event", "items", "share", "latency", "query", "failures"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => (i < 7 ? row[i].length : 0))));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i < 7 ? c.padEnd(widths[i]) : c))
      .join("  ")
      .trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

/** The CLI body of `npm run eval`: prints each call's latency as it finishes, then the table; returns the exit code. */
export async function evalMain(
  llm: LLM,
  opts: { today: string; log?: (s: string) => void },
): Promise<number> {
  const log = opts.log ?? console.log;
  const results = await runPlannerEval(llm, {
    today: opts.today,
    onResult: (r) => log(`${r.pass ? "PASS" : "FAIL"} ${ms(r.latencyMs).padStart(8)}  ${r.case.query}`),
  });
  const passed = results.filter((r) => r.pass).length;
  const total = results.reduce((s, r) => s + r.latencyMs, 0);
  log("");
  log(formatEvalTable(results));
  log("");
  log(
    `${passed}/${results.length} passed · total ${ms(total)} · avg ${ms(total / Math.max(1, results.length))}`,
  );
  return passed === results.length ? 0 : 1;
}
