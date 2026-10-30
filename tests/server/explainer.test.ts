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
    // rehearsal 2 (31/10): 14 real explanations ran 66–102 words — the prompt asked for more than fits; aim lower, fixed shape
    expect(system.content).toMatch(/aim for about 50 words/i);
    expect(system.content).toMatch(/3 sentences/);
    expect(system.content).toMatch(/do not list the items/i);
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

describe("streamExplanation: refine changes", () => {
  it("on a refine the facts start with what changed (labels, budget, deadline) and the prompt asks for it first", async () => {
    const llm = new FakeLLM({ stream: ["ok"] });
    const previous: KitPlan = {
      ...plan,
      budget: 1_500_000,
      deadline: "2026-09-05",
      items: [...plan.items, { ...plan.items[0], key: "uniform", needLabel: "Uniform shirt" }],
    };
    const next: KitPlan = { ...plan, budget: 1_000_000, deadline: "2026-09-04" };
    const diff = { added: [], removed: ["uniform"], changed: [plan.items[1].key] };
    await collect(streamExplanation(llm, next, balanced, undefined, { previous, diff }));
    const [system, user] = llm.calls[0].messages;
    expect(system.content).toMatch(/start with what changed[^\n]*new total/i);
    expect(user.content.startsWith("What changed since the previous version:")).toBe(true);
    expect(user.content).toContain("- Removed: Uniform shirt");
    expect(user.content).toContain(`- Changed: ${plan.items[1].needLabel}`);
    expect(user.content).toContain("- Budget changed: 1.500.000₫ → 1.000.000₫");
    expect(user.content).toContain("- Deadline changed: 2026-09-05 → 2026-09-04");
  });

  it("a new kit has no change facts", async () => {
    const llm = new FakeLLM({ stream: ["ok"] });
    await collect(streamExplanation(llm, plan, balanced));
    expect(llm.calls[0].messages.map((m) => m.content).join("\n")).not.toMatch(/what changed/i);
  });
});

describe("streamExplanation: sales context (ticket 16)", () => {
  it("gets the SalesContext facts and the rule to cite only these numbers", async () => {
    const llm = new FakeLLM({ stream: ["ok"] });
    const sales = {
      today: "2026-09-02",
      deadline: "2026-09-05",
      daysLeft: 3,
      address: "Cau Giay, Hanoi",
      interests: [
        { itemKey: "backpack", title: "KidZone Lite Backpack Grade 1–3", price: 520_000, priceAfterVoucher: 440_000, voucherCode: "LAN-KZ80", overMaxPriceBy: 40_000 },
      ],
      walletVouchers: [{ code: "LAN-BTS10", label: "Back-to-school 10%", validUntil: "2026-09-04", daysToExpiry: 2, usedInBasket: true }],
      freeshipGaps: [],
      favoriteShopPromos: [],
      hooks: ["deadline_soon" as const, "cart_interest" as const, "voucher_expiring" as const],
    };
    await collect(streamExplanation(llm, plan, balanced, undefined, undefined, sales));
    const [system, user] = llm.calls[0].messages;
    expect(system.content).toMatch(/may mention the wallet saving or the cart product; only these numbers/i);
    expect(user.content).toContain("KidZone Lite Backpack Grade 1–3");
    expect(user.content).toContain("440.000₫");
    expect(user.content).toContain("LAN-KZ80");
  });
});
