// Refine planner + PlanDiff (seam S6, pure parts): previous plan + message + excluded items → revised plan.
// FakeLLM only. Code guarantees: excluded items never come back (key or category, D33), unchanged items keep their key.
import { describe, expect, it } from "vitest";
import type { KitPlan } from "@/contract";
import { FakeLLM } from "@/server/llm";
import { postProcessPlan, PlannerError } from "@/server/kit/planner";
import { refineKit } from "@/server/kit/refine-planner";
import { diffPlans } from "@/server/kit/diff";
import { sloppyHeroPlan, refineOutput } from "./support/plans";

const TODAY = "2026-09-02";
const hero = (): KitPlan => postProcessPlan(sloppyHeroPlan() as never, TODAY);
const promptOf = (llm: FakeLLM) => llm.calls[0].messages.map((m) => m.content).join("\n");
const NONE = { keys: [], categories: [] };

describe("diffPlans", () => {
  it("added / removed by key, changed = same key with any field different (tags order-insensitive)", () => {
    const a = hero();
    const b = structuredClone(a);
    b.items = b.items.filter((i) => i.key !== "uniform");
    b.items.push({
      ...a.items[0],
      key: "raincoat",
      category: "kids-raincoat",
      needLabel: "Raincoat",
      mustHaveTags: [],
    });
    b.items.find((i) => i.key === "shoes")!.mustHaveTags = ["non-slip"];
    b.items.find((i) => i.key === "backpack")!.niceToHaveTags.reverse();
    expect(diffPlans(a, b)).toEqual({ added: ["raincoat"], removed: ["uniform"], changed: ["shoes"] });
  });

  it("detects quantity, required, maxUnitPrice, category and label changes; identical plans → empty diff", () => {
    const a = hero();
    expect(diffPlans(a, structuredClone(a))).toEqual({ added: [], removed: [], changed: [] });
    const b = structuredClone(a);
    b.items[1].quantity = 2;
    b.items[2].required = false;
    b.items[0].maxUnitPrice = 500_000;
    b.items[3].category = "notebooks";
    b.items[4].needLabel = "Big bottle";
    expect(diffPlans(a, b).changed.sort()).toEqual(
      [b.items[0], b.items[1], b.items[2], b.items[3], b.items[4]].map((i) => i.key).sort(),
    );
  });
});

describe("refineKit: prompt", () => {
  it("sends the previous plan JSON, the message, the excluded items and the keep-keys rule; planner model + effort", async () => {
    const llm = new FakeLLM({ structured: [refineOutput(sloppyHeroPlan())] });
    await refineKit(
      llm,
      {
        previous: hero(),
        message: "Remove the uniform, budget 1M",
        excluded: { keys: ["lunch-box"], categories: ["lunch-box"] },
      },
      { today: TODAY },
    );
    const prompt = promptOf(llm);
    expect(prompt).toContain(JSON.stringify(hero()));
    expect(prompt).toContain("Remove the uniform, budget 1M");
    expect(prompt).toMatch(/the buyer already has these, never add them/i);
    expect(prompt).toContain("lunch-box");
    expect(prompt).toMatch(/keep the same key/i);
    expect(prompt).toMatch(/"answer" only when no constraint changes/i);
    expect(prompt).toContain(TODAY);
    expect(llm.calls[0]).toMatchObject({ kind: "structured", model: "gpt-6-luna", effort: "low", name: "kit_refine" });
  });

  it("returns the intent and a code-processed plan (same rules as the planner)", async () => {
    const llm = new FakeLLM({ structured: [refineOutput(sloppyHeroPlan({ budget: 1_000_000 }), "answer")] });
    const r = await refineKit(
      llm,
      { previous: hero(), message: "is it anti-hunchback?", excluded: NONE },
      { today: TODAY },
    );
    expect(r.intent).toBe("answer");
    expect(r.plan.budget).toBe(1_000_000);
    expect(r.plan.items.find((i) => i.key === "backpack")!.mustHaveTags).toEqual(["anti-hunchback"]);
    expect(r.plan.items.find((i) => i.key === "uniform")!.quantity).toBe(3);
  });

  it("one retry, then PlannerError llm_error", async () => {
    const ok = new FakeLLM({ structured: ["{bad", refineOutput(sloppyHeroPlan())] });
    await expect(
      refineKit(ok, { previous: hero(), message: "x", excluded: NONE }, { today: TODAY }),
    ).resolves.toBeTruthy();
    const bad = new FakeLLM({ structured: ["{bad", new Error("ECONNRESET")] });
    await expect(
      refineKit(bad, { previous: hero(), message: "x", excluded: NONE }, { today: TODAY }),
    ).rejects.toBeInstanceOf(PlannerError);
  });
});

describe("refineKit: code guarantees", () => {
  it("drops any returned item whose key or category matches an excluded item (D33)", async () => {
    const out = sloppyHeroPlan();
    out.items.push({ ...out.items[4], key: "drink-bottle", needLabel: "Drink bottle" }); // category water-bottle, new key
    out.items.push({ ...out.items[3], key: "old-thing", category: null, needLabel: "Old thing" });
    const llm = new FakeLLM({ structured: [refineOutput(out)] });
    const prev = hero();
    prev.items = prev.items.filter((i) => i.key !== "water-bottle");
    const r = await refineKit(
      llm,
      {
        previous: prev,
        message: "add a bottle",
        excluded: { keys: ["water-bottle", "old-thing"], categories: ["water-bottle"] },
      },
      { today: TODAY },
    );
    expect(r.plan.items.map((i) => i.category)).not.toContain("water-bottle");
    expect(r.plan.items.map((i) => i.key)).not.toContain("water-bottle");
    expect(r.plan.items.map((i) => i.key)).not.toContain("old-thing");
  });

  it("an item renamed by the model in the same category keeps its previous key", async () => {
    const out = sloppyHeroPlan();
    out.items[0] = { ...out.items[0], key: "school-bag" };
    const llm = new FakeLLM({ structured: [refineOutput(out)] });
    const r = await refineKit(llm, { previous: hero(), message: "cheaper backpack", excluded: NONE }, { today: TODAY });
    expect(r.plan.items[0].key).toBe("backpack");
    expect(diffPlans(hero(), r.plan)).toEqual({ added: [], removed: [], changed: [] });
  });
});
