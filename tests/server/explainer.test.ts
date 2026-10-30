// Explainer (PRD "Explainer"): streamed by the fast model, ≤ 70 words / ≤ 4 sentences, in the plan language,
// fed only code-computed facts (totals, savings, gaps, closest product).
import { describe, expect, it } from "vitest";
import type { BasketOption, KitPlan } from "@/contract";
import { FakeLLM } from "@/server/llm";
import { streamExplanation } from "@/server/kit/explainer";
import kitSample from "@/contract/fixtures/kit.sample.json";

const events = kitSample as { event: string; data: { plan?: KitPlan; options?: BasketOption[] } }[];
const plan = events.find((e) => e.event === "plan")!.data.plan!;
const balanced = events.find((e) => e.event === "options")!.data.options!.find((o) => o.profile === "balanced")!;

async function collect(it: AsyncIterable<string>) {
  let s = "";
  for await (const d of it) s += d;
  return s;
}

describe("streamExplanation", () => {
  it("streams the fast model's deltas with KITLY_FAST_EFFORT", async () => {
    const llm = new FakeLLM({ stream: ["Your kit ", "costs 820.000₫."] });
    expect(await collect(streamExplanation(llm, plan, balanced))).toBe("Your kit costs 820.000₫.");
    expect(llm.calls[0]).toMatchObject({ kind: "stream", model: "gpt-6-luna", effort: "low" });
  });

  it("system prompt states the limits; facts carry totals, savings and the closest product for the gap", async () => {
    const llm = new FakeLLM({ stream: ["ok"] });
    await collect(streamExplanation(llm, plan, balanced));
    const [system, user] = llm.calls[0].messages;
    expect(system.role).toBe("system");
    expect(system.content).toContain("70 words");
    expect(system.content).toContain("4 sentences");
    expect(system.content).toMatch(/English/);
    expect(user.content).toContain("1.500.000₫"); // budget
    expect(user.content).toContain(new Intl.NumberFormat("vi-VN").format(balanced.grandTotal) + "₫");
    expect(user.content).toContain("Minh An Kids Backpack New Model 2026");
    expect(user.content).toContain("missing anti-hunchback");
    expect(user.content).toContain("Your wallet voucher Back-to-school 10%");
  });

  it("asks for Vietnamese when the plan language is vi", async () => {
    const llm = new FakeLLM({ stream: ["ok"] });
    await collect(streamExplanation(llm, { ...plan, language: "vi" }, balanced));
    expect(llm.calls[0].messages[0].content).toMatch(/Vietnamese/);
  });
});
