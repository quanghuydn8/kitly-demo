// Seam S8 — planner eval (npm run eval). The real run costs tokens and is not in npm test; here the same eval runs
// the real planKit over FakeLLM outputs so the checks, the table and the exit code are pinned down.
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/contract";
import { FakeLLM } from "@/server/llm";
import {
  EVAL_CASES,
  checkPlan,
  evalMain,
  formatEvalTable,
  runPlannerEval,
  type EvalCase,
} from "@/server/eval/planner-eval";
import { normalizePlan, type PlannerOutput } from "@/server/kit/planner";

type Item = PlannerOutput["items"][number];
const item = (key: string, category: string | null): Item => ({
  key,
  needLabel: key,
  category,
  required: true,
  quantity: 1,
  mustHaveTags: [],
  niceToHaveTags: [],
  maxUnitPrice: null,
});
const out = (event: PlannerOutput["event"], cats: (string | null)[]): PlannerOutput => ({
  event,
  language: "en",
  budget: null,
  deadline: null,
  items: cats.map((c, i) => item(`item-${i}`, c)),
  assumptions: [],
});
const plan = (...a: Parameters<typeof out>) => normalizePlan(out(...a));
const catsOf = (event: string, n: number) =>
  CATEGORIES.filter((c) => c.event === event)
    .slice(0, n)
    .map((c) => c.id);

/** A planner that answers every eval query well: event categories for events, nulls for off-coverage. */
const goodPlan = (c: EvalCase): PlannerOutput =>
  c.kind === "event" ? out(c.event, catsOf(c.event, 7)) : out("other", [null, null, null, null]);

const fakeFor = (plan: (c: EvalCase) => PlannerOutput | Error) =>
  new FakeLLM({
    respond: ({ messages }) => {
      const q = messages[messages.length - 1].content;
      const c = EVAL_CASES.find((x) => x.query === q);
      if (!c) throw new Error(`unexpected query ${q}`);
      const p = plan(c);
      if (p instanceof Error) throw p;
      return p;
    },
  });

const bts: EvalCase = EVAL_CASES.find((c) => c.kind === "event" && c.event === "back_to_school")!;
const puppy: EvalCase = EVAL_CASES.find((c) => c.query === "adopting a puppy")!;

describe("S8 eval cases", () => {
  it("has one query per event (EN + VI mixed) and the three off-coverage queries", () => {
    const events = EVAL_CASES.filter((c) => c.kind === "event");
    expect(events.map((c) => (c.kind === "event" ? c.event : "")).sort()).toEqual(
      ["back_to_school", "camping_trip", "first_apartment", "home_office", "newborn", "tet_gifts"].sort(),
    );
    expect(new Set(events.map((c) => c.language))).toEqual(new Set(["en", "vi"]));
    expect(EVAL_CASES.filter((c) => c.kind === "off").map((c) => c.query)).toEqual([
      "adopting a puppy",
      "planning a wedding",
      "learning guitar",
    ]);
  });
});

describe("S8 checkPlan — event queries", () => {
  it("passes with ≥ 5 items and ≥ 70% in the expected event", () => {
    // 7 of 10 in event = exactly 70%
    const r = checkPlan(bts, plan("back_to_school", [...catsOf("back_to_school", 7), "tent", null, null]));
    expect(r.pass).toBe(true);
    expect(r.itemCount).toBe(10);
    expect(r.inEventShare).toBeCloseTo(0.7);
  });

  it("fails below 70% (nulls and other events count against)", () => {
    const r = checkPlan(
      bts,
      plan("back_to_school", [...catsOf("back_to_school", 6), "tent", null, null, "desk"]),
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join(" ")).toMatch(/70%/);
  });

  it("fails with fewer than 5 items even if all are on-event", () => {
    const r = checkPlan(bts, plan("back_to_school", catsOf("back_to_school", 4)));
    expect(r.pass).toBe(false);
    expect(r.failures.join(" ")).toMatch(/≥ 5 items/);
  });
});

describe("S8 checkPlan — off-coverage queries", () => {
  it("passes with all nulls", () => {
    expect(checkPlan(puppy, plan("other", [null, null, null])).pass).toBe(true);
  });

  it("fails on any wrong-event category, even when ≥ 50% are null", () => {
    const r = checkPlan(puppy, plan("other", [null, null, null, "lunch-box"]));
    expect(r.pass).toBe(false);
    expect(r.wrongCategories).toEqual(["lunch-box"]);
  });

  it("tolerates the case's plausible categories but still needs ≥ 50% null", () => {
    const wedding = EVAL_CASES.find((c) => c.query === "planning a wedding")!;
    expect(checkPlan(wedding, plan("other", [null, null, "wine", "gift-basket"])).pass).toBe(true);
    const r = checkPlan(wedding, plan("other", [null, "wine", "gift-basket", "red-envelopes"]));
    expect(r.pass).toBe(false);
    expect(r.failures.join(" ")).toMatch(/50%/);
  });

  it("an empty plan is not a pass", () => {
    expect(checkPlan(puppy, plan("other", [])).pass).toBe(false);
  });
});

describe("S8 runPlannerEval + evalMain", () => {
  it("runs the real planner prompt once per case on the planner model and times each call", async () => {
    const llm = fakeFor(goodPlan);
    const results = await runPlannerEval(llm, { today: "2026-08-20" });
    expect(results).toHaveLength(9);
    expect(llm.calls).toHaveLength(9);
    expect(
      llm.calls.every(
        (c) => c.name === "kit_plan" && c.model === (process.env.KITLY_MODEL_PLANNER || "gpt-6.1-sol"),
      ),
    ).toBe(true);
    expect(llm.calls[0].messages[0].content).toMatch(/Today is 2026-08-20/);
    expect(results.every((r) => r.pass && r.latencyMs >= 0)).toBe(true);
  });

  it("a failing call is a failed case with the error, and the others still run", async () => {
    const llm = fakeFor((c) => (c === puppy ? new Error("proxy 502") : goodPlan(c)));
    const results = await runPlannerEval(llm, { today: "2026-08-20" });
    const p = results.find((r) => r.case === puppy)!;
    expect(p.pass).toBe(false);
    expect(p.failures.join(" ")).toMatch(/proxy 502/);
    expect(results.filter((r) => r.pass)).toHaveLength(8);
  });

  it("prints latency per call and a pass/fail table; exit code 0 when all pass", async () => {
    const lines: string[] = [];
    const code = await evalMain(fakeFor(goodPlan), { today: "2026-08-20", log: (s) => lines.push(s) });
    const text = lines.join("\n");
    expect(code).toBe(0);
    for (const c of EVAL_CASES) expect(text).toContain(c.query);
    expect(text).toMatch(/\d+ ms/);
    expect(text).toMatch(/9\/9 passed/);
  });

  it("exits non-zero when any case fails and names the failure", async () => {
    const lines: string[] = [];
    const code = await evalMain(
      fakeFor((c) =>
        c === bts ? out("back_to_school", ["lunch-box", "tent", "desk", null, null]) : goodPlan(c),
      ),
      { today: "2026-08-20", log: (s) => lines.push(s) },
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/FAIL/);
    expect(lines.join("\n")).toMatch(/8\/9 passed/);
  });

  it("formatEvalTable has one row per case", async () => {
    const results = await runPlannerEval(fakeFor(goodPlan), { today: "2026-08-20" });
    const table = formatEvalTable(results);
    expect(table.split("\n").filter((l) => /PASS|FAIL/.test(l))).toHaveLength(9);
  });
});
