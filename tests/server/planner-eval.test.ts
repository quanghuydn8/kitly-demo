// Planner eval (seam S8, ticket 08): the checks `npm run eval` applies to the real model, run here on FakeLLM outputs.
// The script itself (scripts/eval.ts) calls the real model and is not part of npm test.
import { describe, expect, it } from "vitest";
import { FakeLLM } from "@/server/llm";
import { EVAL_CASES, formatReport, runEval, type EvalCase } from "@/server/eval/planner-eval";
import { refineOutput, sloppyHeroPlan } from "./support/plans";

const TODAY = "2026-09-02";

const item = (key: string, category: string | null) => ({
  key,
  needLabel: key,
  category,
  required: true,
  quantity: 1,
  mustHaveTags: [],
  niceToHaveTags: [],
  maxUnitPrice: null,
});
const planOf = (event: string, categories: (string | null)[], deadline: string | null = null) => ({
  event,
  language: "en",
  budget: null,
  deadline,
  items: categories.map((c, i) => item(`item-${i}`, c)),
  assumptions: [],
});

const camping: EvalCase = {
  id: "camping",
  kind: "plan",
  query: "Camping trip for 2 this weekend",
  event: "camping_trip",
};

describe("runEval — event queries", () => {
  it("passes a plan with ≥ 5 items and ≥ 70% of categories in the expected event, and records the latency", async () => {
    const llm = new FakeLLM({
      structured: [
        planOf("camping_trip", ["tent", "sleeping-bag", "headlamp", "cooler-box", null, "sunscreen", "dry-bag"]),
      ],
    });
    const [row] = await runEval(llm, { today: TODAY, cases: [camping] });
    expect(row.id).toBe("camping");
    expect(row.pass).toBe(true);
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    expect(row.checks.every((c) => c.pass)).toBe(true);
    expect(llm.calls[0].messages.at(-1)!.content).toBe("Camping trip for 2 this weekend");
  });

  it("fails on < 5 items, and on < 70% of categories in the expected event (null and other events count against)", async () => {
    const llm = new FakeLLM({
      structured: [
        planOf("camping_trip", ["tent", "sleeping-bag", "headlamp", "cooler-box"]),
        planOf("camping_trip", ["tent", "sleeping-bag", "headlamp", null, "desk", "rice-cooker"]),
      ],
    });
    const [few, wrong] = await runEval(llm, { today: TODAY, cases: [camping, { ...camping, id: "camping-2" }] });
    expect(few.pass).toBe(false);
    expect(few.checks.find((c) => c.name === "items")!.pass).toBe(false);
    expect(wrong.pass).toBe(false);
    expect(wrong.checks.find((c) => c.name === "items")!.pass).toBe(true);
    expect(wrong.checks.find((c) => c.name === "event")).toMatchObject({
      pass: false,
      detail: expect.stringContaining("50%"),
    });
  });
});

describe("runEval — off-coverage queries", () => {
  const wedding: EvalCase = {
    id: "wedding",
    kind: "off_coverage",
    query: "planning a wedding",
    allowedCategories: ["red-envelopes"],
  };

  it("passes with ≥ 5 items, ≥ 50% null categories and only allowed categories", async () => {
    const llm = new FakeLLM({
      structured: [planOf("other", [null, null, null, "red-envelopes", null, "red-envelopes"])],
    });
    const [row] = await runEval(llm, { today: TODAY, cases: [wedding] });
    expect(row.checks.map((c) => [c.name, c.pass])).toEqual([
      ["items", true],
      ["null", true],
      ["no-wrong", true],
    ]);
    expect(row.pass).toBe(true);
  });

  it("fails on a wrong-event category even when ≥ 50% are null, and on < 50% null", async () => {
    const llm = new FakeLLM({
      structured: [
        planOf("other", [null, null, null, "wine", null]),
        planOf("other", [null, null, "red-envelopes", "red-envelopes", "red-envelopes"]),
      ],
    });
    const [wrong, fewNull] = await runEval(llm, { today: TODAY, cases: [wedding, { ...wedding, id: "w2" }] });
    expect(wrong.pass).toBe(false);
    expect(wrong.checks.find((c) => c.name === "no-wrong")).toMatchObject({
      pass: false,
      detail: expect.stringContaining("wine"),
    });
    expect(fewNull.pass).toBe(false);
    expect(fewNull.checks.find((c) => c.name === "null")!.pass).toBe(false);
  });
});

describe("runEval — Beat 1 deadline and refines of that plan", () => {
  const beat: EvalCase = {
    id: "beat1-vi",
    kind: "plan",
    query: "Con tôi chuẩn bị vào lớp 1, ngân sách 1,5 triệu. Balo phải chống gù, dưới 400k.",
    event: "back_to_school",
    deadline: "2026-09-05",
  };
  const express: EvalCase = {
    id: "refine-express",
    kind: "refine",
    of: "beat1-vi",
    query: "Ship hoả tốc giúp tôi",
    intent: "change_kit",
    deadline: "2026-09-04",
  };
  const answer: EvalCase = {
    id: "refine-answer",
    kind: "refine",
    of: "beat1-vi",
    query: "Balo Minh An có chống gù thật không?",
    intent: "answer",
  };

  it("checks the plan deadline, then refines THAT plan and checks intent + deadline", async () => {
    const llm = new FakeLLM({
      structured: [
        sloppyHeroPlan(),
        refineOutput(sloppyHeroPlan({ deadline: "2026-09-04" })),
        refineOutput(sloppyHeroPlan(), "answer"),
      ],
    });
    const rows = await runEval(llm, { today: TODAY, cases: [beat, express, answer] });
    expect(rows.map((r) => [r.id, r.pass])).toEqual([
      ["beat1-vi", true],
      ["refine-express", true],
      ["refine-answer", true],
    ]);
    expect(rows[0].checks.find((c) => c.name === "deadline")!.detail).toContain("2026-09-05");
    expect(rows[1].checks.map((c) => c.name)).toEqual(["intent", "deadline"]);
    expect(rows[2].checks.map((c) => c.name)).toEqual(["intent"]);
    // The refine call carries the Beat 1 plan the model just returned and the buyer's message.
    const refinePrompt = llm.calls[1].messages.at(-1)!.content;
    expect(refinePrompt).toContain('"deadline":"2026-09-05"');
    expect(refinePrompt).toContain("Buyer message: Ship hoả tốc giúp tôi");
  });

  it("fails a wrong deadline and a wrong intent", async () => {
    const llm = new FakeLLM({
      structured: [
        sloppyHeroPlan({ deadline: null }),
        refineOutput(sloppyHeroPlan({ deadline: "2026-09-05" })),
        refineOutput(sloppyHeroPlan(), "change_kit"),
      ],
    });
    const rows = await runEval(llm, { today: TODAY, cases: [beat, express, answer] });
    expect(rows.map((r) => r.pass)).toEqual([false, false, false]);
    expect(rows[0].checks.find((c) => c.name === "deadline")!.detail).toContain("null");
    expect(rows[1].checks.find((c) => c.name === "deadline")!.pass).toBe(false);
    expect(rows[1].checks.find((c) => c.name === "intent")!.pass).toBe(true);
    expect(rows[2].checks.find((c) => c.name === "intent")).toMatchObject({
      pass: false,
      detail: expect.stringContaining("change_kit"),
    });
  });

  it("an LLM failure fails that row (and the refines of its plan) and the eval goes on", async () => {
    const llm = new FakeLLM({
      structured: [
        new Error("proxy 502"),
        new Error("proxy 502"), // planKit retries once
        planOf("camping_trip", ["tent", "sleeping-bag", "headlamp", "cooler-box", "sunscreen"]),
      ],
    });
    const rows = await runEval(llm, { today: TODAY, cases: [beat, express, camping] });
    expect(rows.map((r) => [r.id, r.pass])).toEqual([
      ["beat1-vi", false],
      ["refine-express", false],
      ["camping", true],
    ]);
    expect(rows[0].checks).toEqual([{ name: "error", pass: false, detail: expect.stringContaining("proxy 502") }]);
    expect(rows[1].checks).toEqual([{ name: "error", pass: false, detail: "no plan from beat1-vi" }]);
    expect(llm.calls).toHaveLength(3); // the refine is not sent without its plan
  });
});

describe("EVAL_CASES (ticket 08)", () => {
  it("one query per event (EN + VI mixed), the 3 off-coverage needs, both Beat 1 sentences, express + answer refines", () => {
    const plans = EVAL_CASES.filter((c) => c.kind === "plan");
    expect(new Set(plans.map((c) => c.kind === "plan" && c.event))).toEqual(
      new Set(["back_to_school", "newborn", "first_apartment", "camping_trip", "home_office", "tet_gifts"]),
    );
    const vi = (q: string) => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(q);
    const eventOnly = plans.filter((c) => !c.id.startsWith("beat1"));
    expect(eventOnly).toHaveLength(6);
    expect(eventOnly.some((c) => vi(c.query))).toBe(true);
    expect(eventOnly.some((c) => !vi(c.query))).toBe(true);

    expect(EVAL_CASES.filter((c) => c.kind === "off_coverage").map((c) => c.query)).toEqual([
      "adopting a puppy",
      "planning a wedding",
      "learning guitar",
    ]);
    const byQuery = (q: string) => EVAL_CASES.find((c) => c.query === q);
    expect(byQuery("Con tôi chuẩn bị vào lớp 1, ngân sách 1,5 triệu. Balo phải chống gù, dưới 400k.")).toMatchObject({
      kind: "plan",
      event: "back_to_school",
      deadline: "2026-09-05",
    });
    expect(
      byQuery("My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k."),
    ).toMatchObject({
      kind: "plan",
      deadline: "2026-09-05",
    });
    const beatVi = byQuery("Con tôi chuẩn bị vào lớp 1, ngân sách 1,5 triệu. Balo phải chống gù, dưới 400k.")!.id;
    expect(byQuery("Ship hoả tốc giúp tôi")).toMatchObject({
      kind: "refine",
      of: beatVi,
      intent: "change_kit",
      deadline: "2026-09-04",
    });
    expect(byQuery("Balo Minh An có chống gù thật không?")).toMatchObject({
      kind: "refine",
      of: beatVi,
      intent: "answer",
    });
    // Every refine comes after the plan it refines.
    EVAL_CASES.forEach((c, i) => {
      if (c.kind === "refine") expect(EVAL_CASES.findIndex((p) => p.id === c.of)).toBeLessThan(i);
    });
  });
});

describe("formatReport", () => {
  it("prints one row per call with PASS/FAIL, latency in seconds and the failing checks, then a summary", () => {
    const report = formatReport([
      {
        id: "camping",
        query: "q1",
        latencyMs: 4321,
        pass: true,
        checks: [{ name: "items", pass: true, detail: "7 items (≥ 5)" }],
      },
      {
        id: "wedding",
        query: "q2",
        latencyMs: 980,
        pass: false,
        checks: [
          { name: "items", pass: true, detail: "6 items (≥ 5)" },
          { name: "no-wrong", pass: false, detail: "wrong: wine" },
        ],
      },
    ]);
    const lines = report.split("\n");
    const camping = lines.find((l) => l.includes("camping"))!;
    expect(camping).toContain("PASS");
    expect(camping).toContain("4.3 s");
    const wedding = lines.find((l) => l.includes("wedding"))!;
    expect(wedding).toContain("FAIL");
    expect(wedding).toContain("1.0 s");
    expect(wedding).toContain("no-wrong: wrong: wine");
    expect(lines.at(-1)).toBe("1/2 passed · FAIL");
  });
});
