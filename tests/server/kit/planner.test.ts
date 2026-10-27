// Seam: planKit (public planner entry) with FakeLLM — F1 must-have discipline + quantity clamp + prompt rules, F2 one retry.
import { describe, expect, it } from "vitest";
import { planKit, plannerSystemPrompt } from "@/server/kit/planner";
import { FakeLLM } from "@/server/llm";

const out = (items: Record<string, unknown>[]) => ({
  event: "back_to_school",
  language: "en",
  budget: null,
  deadline: null,
  items: items.map((it, i) => ({
    key: `k${i}`,
    needLabel: `Need ${i}`,
    category: "notebooks",
    required: true,
    quantity: 1,
    mustHaveTags: [],
    niceToHaveTags: [],
    maxUnitPrice: null,
    ...it,
  })),
  assumptions: [],
});

describe("planKit — F1 normalisation", () => {
  it("context tags are never must-haves: they move to niceToHaveTags; explicit attribute tags stay", async () => {
    const llm = new FakeLLM({
      structured: [
        out([
          {
            category: "school-backpack",
            mustHaveTags: ["anti-hunchback", "grade-1", "kids", "budget", "premium", "gift-wrapped", "eco-friendly", "newborn-0-3m"],
            niceToHaveTags: ["lightweight"],
          },
        ]),
      ],
    });
    const plan = await planKit(llm, "q", "2026-08-20");
    expect(plan.items[0].mustHaveTags).toEqual(["anti-hunchback"]);
    expect(plan.items[0].niceToHaveTags).toEqual(
      expect.arrayContaining(["lightweight", "grade-1", "kids", "budget", "premium", "gift-wrapped", "eco-friendly", "newborn-0-3m"]),
    );
    expect(new Set(plan.items[0].niceToHaveTags).size).toBe(plan.items[0].niceToHaveTags.length);
  });

  it("quantity is clamped to 1..3", async () => {
    const llm = new FakeLLM({ structured: [out([{ quantity: 12 }, { quantity: 0 }, { quantity: -2 }, { quantity: 2 }])] });
    const plan = await planKit(llm, "q", "2026-08-20");
    expect(plan.items.map((i) => i.quantity)).toEqual([3, 1, 1, 2]);
  });

  it("prompt tells the model: packs are quantity 1, context is never a must-have, be deterministic", () => {
    const p = plannerSystemPrompt("2026-08-20");
    expect(p).toMatch(/one pack/i);
    expect(p).toMatch(/book covers/i);
    expect(p).toMatch(/same (sentence|need).*same plan/i);
    expect(p).toMatch(/never a must-have/i);
  });
});

describe("planKit — F2 retry once", () => {
  it("a thrown model error is retried once, then succeeds", async () => {
    let n = 0;
    const llm = new FakeLLM({
      respond: () => {
        if (n++ === 0) throw new Error("proxy blip");
        return out([{}]);
      },
    });
    const plan = await planKit(llm, "q", "2026-08-20");
    expect(plan.items).toHaveLength(1);
    expect(llm.calls.filter((c) => c.kind === "structured")).toHaveLength(2);
  });

  it("a schema-invalid output is retried once", async () => {
    const llm = new FakeLLM({ structured: [{ nonsense: true }, out([{}])] });
    const plan = await planKit(llm, "q", "2026-08-20");
    expect(plan.items).toHaveLength(1);
    expect(llm.calls).toHaveLength(2);
  });

  it("fails twice → throws after exactly 2 calls (no endless retry)", async () => {
    const llm = new FakeLLM({
      respond: () => {
        throw new Error("down");
      },
    });
    await expect(planKit(llm, "q", "2026-08-20")).rejects.toThrow("down");
    expect(llm.calls).toHaveLength(2);
  });
});
