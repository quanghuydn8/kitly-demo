// Planner eval (seam S8, ticket 08): runs the real planner + refine planner on fixed queries and checks the plans.
// `npm run eval` (scripts/eval.ts) runs it against the real model; tests run it on FakeLLM. Never part of npm test.
import { categoryById, type EventType, type KitPlan } from "@/contract";
import type { LLMClient } from "@/server/llm";
import { planKit } from "@/server/kit/planner";
import { refineKit, type RefineIntent } from "@/server/kit/refine-planner";

/**
 * One eval query. `plan`: categories must belong to `event` (and the deadline equal `deadline` when given).
 * `refine`: the refine planner on the plan case `of` returned, with `query` as the buyer message. `off_coverage`: a need outside the taxonomy — mostly null
 * categories, and any category must be in `allowedCategories` (a plausible cross-over, e.g. red envelopes for a
 * wedding); every other category is a wrong one.
 */
export type EvalCase =
  | { id: string; kind: "plan"; query: string; event: Exclude<EventType, "other">; deadline?: string }
  | { id: string; kind: "refine"; of: string; query: string; intent: RefineIntent; deadline?: string }
  | { id: string; kind: "off_coverage"; query: string; allowedCategories: string[] };

/** The eval runs on this demo date (D45): the expected deadlines below are Sep 5 (school opening) and today + 2. */
export const EVAL_TODAY = "2026-09-02";

const BEAT1_VI = "Con tôi chuẩn bị vào lớp 1, ngân sách 1,5 triệu. Balo phải chống gù, dưới 400k.";
const BEAT1_EN = "My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.";

/** Ticket 08: 6 event queries (EN + VI mixed), 3 off-coverage needs, both Beat 1 sentences and two refines of Beat 1. */
export const EVAL_CASES: EvalCase[] = [
  {
    id: "back-to-school",
    kind: "plan",
    event: "back_to_school",
    query: "Getting my two kids (grade 3 and grade 5) ready for the new school year, budget 2M.",
  },
  {
    id: "newborn",
    kind: "plan",
    event: "newborn",
    query: "Chuẩn bị đồ sơ sinh cho bé sắp chào đời, ngân sách 3 triệu.",
  },
  {
    id: "first-apartment",
    kind: "plan",
    event: "first_apartment",
    query: "Moving into my first apartment next month, I need the basics for the kitchen and the bedroom.",
  },
  { id: "camping-trip", kind: "plan", event: "camping_trip", query: "Đi cắm trại 2 ngày 1 đêm cho 4 người ở Ba Vì." },
  {
    id: "home-office",
    kind: "plan",
    event: "home_office",
    query: "Setting up a home office to work remotely full time, budget 10M.",
  },
  { id: "tet-gifts", kind: "plan", event: "tet_gifts", query: "Mua quà Tết biếu sếp và bố mẹ vợ, khoảng 2 triệu." },
  { id: "puppy", kind: "off_coverage", query: "adopting a puppy", allowedCategories: [] },
  { id: "wedding", kind: "off_coverage", query: "planning a wedding", allowedCategories: ["red-envelopes", "wine"] },
  { id: "guitar", kind: "off_coverage", query: "learning guitar", allowedCategories: ["headset"] },
  { id: "beat1-vi", kind: "plan", event: "back_to_school", query: BEAT1_VI, deadline: "2026-09-05" },
  { id: "beat1-en", kind: "plan", event: "back_to_school", query: BEAT1_EN, deadline: "2026-09-05" },
  {
    id: "refine-express",
    kind: "refine",
    of: "beat1-vi",
    query: "Ship hoả tốc giúp tôi",
    intent: "change_kit",
    deadline: "2026-09-04",
  },
  {
    id: "refine-answer",
    kind: "refine",
    of: "beat1-vi",
    query: "Balo Minh An có chống gù thật không?",
    intent: "answer",
  },
];

export interface EvalCheck {
  name: string;
  pass: boolean;
  detail: string;
}
export interface EvalRow {
  id: string;
  query: string;
  latencyMs: number;
  pass: boolean;
  checks: EvalCheck[];
}

const MIN_ITEMS = 5;
const EVENT_SHARE = 0.7;
const NULL_SHARE = 0.5;

const pct = (n: number) => `${Math.round(n * 100)}%`;

const deadlineCheck = (plan: KitPlan, expected: string): EvalCheck => ({
  name: "deadline",
  pass: plan.deadline === expected,
  detail: `${plan.deadline ?? "null"} (want ${expected})`,
});

function planChecks(plan: KitPlan, c: Exclude<EvalCase, { kind: "refine" }>): EvalCheck[] {
  const n = plan.items.length;
  const items = { name: "items", pass: n >= MIN_ITEMS, detail: `${n} items (≥ ${MIN_ITEMS})` };
  if (c.kind === "off_coverage") {
    const nulls = plan.items.filter((i) => i.category === null).length / (n || 1);
    const wrong = plan.items.flatMap((i) =>
      i.category && !c.allowedCategories.includes(i.category) ? [i.category] : [],
    );
    return [
      items,
      { name: "null", pass: n > 0 && nulls >= NULL_SHARE, detail: `${pct(nulls)} null (≥ ${pct(NULL_SHARE)})` },
      { name: "no-wrong", pass: !wrong.length, detail: wrong.length ? `wrong: ${wrong.join(", ")}` : "none wrong" },
    ];
  }
  const inEvent = plan.items.filter((i) => categoryById(i.category)?.event === c.event).length;
  const share = n ? inEvent / n : 0;
  return [
    items,
    { name: "event", pass: share >= EVENT_SHARE, detail: `${pct(share)} in ${c.event} (≥ ${pct(EVENT_SHARE)})` },
    ...(c.deadline ? [deadlineCheck(plan, c.deadline)] : []),
  ];
}

async function runCase(llm: LLMClient, c: EvalCase, today: string, plans: Map<string, KitPlan>): Promise<EvalCheck[]> {
  if (c.kind === "refine") {
    const previous = plans.get(c.of);
    if (!previous) throw new Error(`no plan from ${c.of}`);
    const out = await refineKit(llm, { previous, message: c.query, excluded: { keys: [], categories: [] } }, { today });
    return [
      { name: "intent", pass: out.intent === c.intent, detail: `${out.intent} (want ${c.intent})` },
      ...(c.deadline ? [deadlineCheck(out.plan, c.deadline)] : []),
    ];
  }
  const plan = await planKit(llm, c.query, { today });
  plans.set(c.id, plan);
  return planChecks(plan, c);
}

/** Runs the cases in order (a refine needs its plan first), one call at a time so each latency is the call's own. */
export async function runEval(llm: LLMClient, opts: { today: string; cases: EvalCase[] }): Promise<EvalRow[]> {
  const today = opts.today;
  const plans = new Map<string, KitPlan>();
  const rows: EvalRow[] = [];
  for (const c of opts.cases) {
    const started = performance.now();
    let checks: EvalCheck[];
    try {
      checks = await runCase(llm, c, today, plans);
    } catch (err) {
      checks = [{ name: "error", pass: false, detail: err instanceof Error ? err.message : String(err) }];
    }
    const latencyMs = Math.round(performance.now() - started);
    rows.push({ id: c.id, query: c.query, latencyMs, pass: checks.every((x) => x.pass), checks });
  }
  return rows;
}

const fmtSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Pass/fail table: one row per call (latency + checks; failing checks spelled out), then "<n>/<total> passed · PASS|FAIL". */
export function formatReport(rows: EvalRow[]): string {
  const idWidth = Math.max(2, ...rows.map((r) => r.id.length));
  const header = `${"id".padEnd(idWidth)}  result  latency  checks`;
  const lines = rows.map((r) => {
    const checks = r.checks.map((c) => (c.pass ? c.name : `✗ ${c.name}: ${c.detail}`)).join(" · ");
    return `${r.id.padEnd(idWidth)}  ${(r.pass ? "PASS" : "FAIL").padEnd(6)}  ${fmtSeconds(r.latencyMs).padStart(7)}  ${checks}`;
  });
  const passed = rows.filter((r) => r.pass).length;
  const verdict = passed === rows.length ? "PASS" : "FAIL";
  return [header, "-".repeat(header.length), ...lines, "", `${passed}/${rows.length} passed · ${verdict}`].join("\n");
}
