// Planner (PRD "Planner"): prompt rules + code-enforced post-processing + one automatic retry. FakeLLM only.
import { describe, expect, it } from "vitest";
import { FakeLLM } from "@/server/llm";
import { planKit, PlannerError } from "@/server/kit/planner";
import { HERO, sloppyHeroPlan } from "./support/plans";

const TODAY = "2026-09-02";
const promptOf = (llm: FakeLLM) => llm.calls[0].messages.map((m) => m.content).join("\n");

describe("planKit: prompt", () => {
  it("states today's date, VND, Sep 5 school opening, express, null categories and the set/pack rule", async () => {
    const llm = new FakeLLM({ structured: [sloppyHeroPlan()] });
    await planKit(llm, HERO, { today: TODAY });
    const prompt = promptOf(llm);
    expect(prompt).toContain(TODAY);
    expect(prompt).toContain("Sep 5");
    expect(prompt).toContain("By Sep 5 (school opening)");
    expect(prompt).toContain("VND");
    expect(prompt).toMatch(/use null when no category fits, never force one/i);
    expect(prompt).toMatch(/vietnamese input → language vi/i);
    expect(prompt).toMatch(/express/i);
    expect(prompt).toContain("2026-09-04"); // today + 2 for express
    expect(prompt).toMatch(/set\/pack items[^\n]*quantity 1/i);
    expect(prompt).toMatch(/uniform = 2/);
    expect(prompt).toMatch(/Be consistent: the same sentence must give the same plan/);
    expect(prompt).toMatch(/tet_gifts 5–8 gift items/);
    expect(prompt).toContain(HERO);
  });

  it("calls the planner model with KITLY_PLANNER_EFFORT (default low)", async () => {
    const llm = new FakeLLM({ structured: [sloppyHeroPlan()] });
    await planKit(llm, HERO, { today: TODAY });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({ kind: "structured", model: "gpt-6-luna", effort: "low" });
  });
});

describe("planKit: post-processing (applied whatever the LLM returned)", () => {
  it("must-have tags only where the buyer said so; context tags move to nice-to-have", async () => {
    const plan = await planKit(new FakeLLM({ structured: [sloppyHeroPlan()] }), HERO, { today: TODAY });
    const byKey = Object.fromEntries(plan.items.map((i) => [i.key, i]));
    expect(byKey.backpack.mustHaveTags).toEqual(["anti-hunchback"]);
    for (const i of plan.items.filter((x) => x.key !== "backpack")) expect(i.mustHaveTags).toEqual([]);
    expect(byKey.backpack.niceToHaveTags.sort()).toEqual(["grade-1", "kids", "lightweight"]);
    expect(byKey.notebooks.niceToHaveTags).toEqual(["grade-1"]);
    expect(byKey.shoes.niceToHaveTags.sort()).toEqual(["budget", "kids"]);
    for (const i of plan.items) {
      expect(i.mustHaveTags).not.toContain("grade-1");
      expect(i.mustHaveTags).not.toContain("kids");
    }
  });

  it("clamps every quantity to 1..3", async () => {
    const plan = await planKit(new FakeLLM({ structured: [sloppyHeroPlan()] }), HERO, { today: TODAY });
    const q = Object.fromEntries(plan.items.map((i) => [i.key, i.quantity]));
    expect(q.uniform).toBe(3);
    expect(q.notebooks).toBe(1);
    expect(q["book-covers"]).toBeLessThanOrEqual(3);
    expect(q.pencils).toBeLessThanOrEqual(3);
    expect(plan.budget).toBe(1_500_000);
  });

  it("keeps a valid deadline on/after today, nulls one before today or malformed", async () => {
    const ok = await planKit(new FakeLLM({ structured: [sloppyHeroPlan()] }), HERO, { today: TODAY });
    expect(ok.deadline).toBe("2026-09-05");
    const past = await planKit(new FakeLLM({ structured: [sloppyHeroPlan({ deadline: "2026-08-30" })] }), HERO, {
      today: TODAY,
    });
    expect(past.deadline).toBeNull();
    const bad = await planKit(new FakeLLM({ structured: [sloppyHeroPlan({ deadline: "2026-02-31" })] }), HERO, {
      today: TODAY,
    });
    expect(bad.deadline).toBeNull();
    const todayOk = await planKit(new FakeLLM({ structured: [sloppyHeroPlan({ deadline: TODAY })] }), HERO, {
      today: TODAY,
    });
    expect(todayOk.deadline).toBe(TODAY);
  });

  it("makes item keys unique", async () => {
    const raw = sloppyHeroPlan();
    raw.items[1].key = "backpack";
    const plan = await planKit(new FakeLLM({ structured: [raw] }), HERO, { today: TODAY });
    const keys = plan.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("planKit: retry", () => {
  it("retries once after an invalid structured output, then succeeds", async () => {
    const llm = new FakeLLM({ structured: ["{not json", sloppyHeroPlan()] });
    const plan = await planKit(llm, HERO, { today: TODAY });
    expect(llm.calls).toHaveLength(2);
    expect(plan.items.length).toBe(9);
  });

  it("retries once after a network error; a second failure throws PlannerError llm_error", async () => {
    const llm = new FakeLLM({ structured: [new Error("ECONNRESET"), new Error("ECONNRESET")] });
    const err = await planKit(llm, HERO, { today: TODAY }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlannerError);
    expect((err as PlannerError).code).toBe("llm_error");
    expect(llm.calls).toHaveLength(2);
  });
});
