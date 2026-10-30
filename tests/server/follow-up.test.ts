// followUp (ticket 16, seam S10, CONTRACT FollowUp / D41): one structured fast-model call + the code guard + the
// code template of the first hook (vi/en). FakeLLM is the only fake.
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowUpSchema, type BasketOption, type KitPlan, type SalesContext, type SalesHook } from "@/contract";
import { FakeLLM, fakeDelay } from "@/server/llm";
import { findInterests } from "@/server/kit/interests";
import { buildSalesContext } from "@/server/kit/sales-context";
import { followUp, templateFollowUp, type FollowUpInput } from "@/server/kit/follow-up";
import { heroWorld, TODAY } from "./support/personal";

async function heroInput(language: "en" | "vi" = "en"): Promise<FollowUpInput> {
  const w = await heroWorld("lan");
  const plan: KitPlan = { ...w.plan, language };
  const option: BasketOption = { ...w.balanced, interests: findInterests(plan, w.balanced, w.match.pool, w.persona, w.vouchers, TODAY) };
  const context = buildSalesContext(plan, option, w.persona, w.vouchers, TODAY, w.shops);
  return { plan, option, context, lastMessage: "My kid starts Grade 1.", vouchers: w.vouchers };
}
const llmOut = (question: string, suggestions: { text: string; interestItemKey?: string | null }[]) => ({
  question,
  suggestions: suggestions.map((s) => ({ text: s.text, interestItemKey: s.interestItemKey ?? null })),
});
const run = (out: unknown, input: FollowUpInput, opts?: { timeoutMs?: number }) =>
  followUp(new FakeLLM({ structured: [out] }), input, opts);

afterEach(() => vi.unstubAllEnvs());

describe("followUp: the model call", () => {
  it("uses the fast model + KITLY_FAST_EFFORT; the prompt carries the rules and the JSON sales context", async () => {
    vi.stubEnv("KITLY_MODEL_FAST", "fast-x");
    vi.stubEnv("KITLY_FAST_EFFORT", "minimal");
    const input = await heroInput();
    const llm = new FakeLLM({ structured: [llmOut("Need express delivery?", [{ text: "Yes please" }, { text: "No thanks" }])] });
    await followUp(llm, input);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({ kind: "structured", model: "fast-x", effort: "minimal" });
    const prompt = llm.calls[0].messages.map((m) => m.content).join("\n");
    expect(prompt).toMatch(/English/);
    expect(prompt).toMatch(/ONE question/);
    expect(prompt).toMatch(/ends? with "\?"/);
    expect(prompt).toMatch(/ONLY facts from the JSON/i);
    expect(prompt).toMatch(/first hook/i);
    expect(prompt).toMatch(/2.3 short suggestions/i);
    expect(prompt).toContain(JSON.stringify(input.context));
    expect(prompt).toContain("My kid starts Grade 1.");
  });

  it("vi plan ⇒ the prompt asks for Vietnamese", async () => {
    const llm = new FakeLLM({ structured: [llmOut("Bạn cần giao hoả tốc không?", [{ text: "Có" }, { text: "Không" }])] });
    await followUp(llm, await heroInput("vi"));
    expect(llm.calls[0].messages.map((m) => m.content).join("\n")).toMatch(/Vietnamese/);
  });
});

describe("followUp: the guard (CONTRACT §1)", () => {
  it("a price not in the context (399.000₫) ⇒ the template of the first hook, source template", async () => {
    const input = await heroInput();
    const f = await run(llmOut("The KidZone Lite is only 399.000₫ now, switch?", [{ text: "Switch" }, { text: "Keep" }]), input);
    expect(f).toEqual(templateFollowUp(input));
    expect(f.source).toBe("template");
  });

  it("440.000₫ and LAN-KZ80 are in the context ⇒ kept, source llm; interestItemKey backpack ⇒ swap action", async () => {
    const input = await heroInput();
    const f = await run(
      llmOut("The KidZone Lite from your cart is 440.000₫ with LAN-KZ80. Switch to it?", [
        { text: "Switch to KidZone Lite", interestItemKey: "backpack" },
        { text: "Keep my kit" },
      ]),
      input,
    );
    expect(f.source).toBe("llm");
    expect(f.question).toBe("The KidZone Lite from your cart is 440.000₫ with LAN-KZ80. Switch to it?");
    expect(f.suggestions[0]).toEqual({
      text: "Switch to KidZone Lite",
      action: { type: "swap", itemKey: "backpack", productId: "prod-kidzone-lite-backpack" },
    });
    expect(f.suggestions[1]).toEqual({ text: "Keep my kit" });
    expect(FollowUpSchema.parse(f)).toEqual(f);
  });

  it("number formats: 440k / 440,000 ok, 399k not; option totals and the budget are allowed", async () => {
    const input = await heroInput();
    const ok = await run(llmOut("Switch to the 440k backpack?", [{ text: "Yes" }, { text: "No" }]), input);
    expect(ok.source).toBe("llm");
    const ok2 = await run(llmOut("Switch to the 440,000 VND backpack?", [{ text: "Yes" }, { text: "No" }]), input);
    expect(ok2.source).toBe("llm");
    const total = input.option!.grandTotal.toLocaleString("vi-VN");
    const ok3 = await run(llmOut(`Your total is ${total}₫ within 1.500.000₫ — check out?`, [{ text: "Yes" }, { text: "No" }]), input);
    expect(ok3.source).toBe("llm");
    const bad = await run(llmOut("Switch to the 399k backpack?", [{ text: "Yes" }, { text: "No" }]), input);
    expect(bad.source).toBe("template");
    const badSuggestion = await run(llmOut("Switch backpacks?", [{ text: "Yes, at 399k" }, { text: "No" }]), input);
    expect(badSuggestion.source).toBe("template");
  });

  it("an unknown voucher code ⇒ template; a known code not in the context ⇒ template", async () => {
    const input = await heroInput();
    expect((await run(llmOut("Use SALE20 to save more?", [{ text: "Yes" }, { text: "No" }]), input)).source).toBe("template");
    expect((await run(llmOut("Apply BAGO15 too?", [{ text: "Yes" }, { text: "No" }]), input)).source).toBe("template");
    expect((await run(llmOut("Use LAN-BTS10 before it expires?", [{ text: "Yes" }, { text: "No" }]), input)).source).toBe("llm");
  });

  it("dates must equal today or the deadline", async () => {
    const input = await heroInput();
    expect((await run(llmOut("Want it all by Sep 5?", [{ text: "Yes" }, { text: "No" }]), input)).source).toBe("llm");
    expect((await run(llmOut("Want it all by Sep 7?", [{ text: "Yes" }, { text: "No" }]), input)).source).toBe("template");
    const vi = await heroInput("vi");
    expect((await run(llmOut("Bạn muốn nhận trước 5/9 không?", [{ text: "Có" }, { text: "Không" }]), vi)).source).toBe("llm");
    expect((await run(llmOut("Bạn muốn nhận trước 7/9 không?", [{ text: "Có" }, { text: "Không" }]), vi)).source).toBe("template");
    expect((await run(llmOut("Deliver by 2026-09-06?", [{ text: "Yes" }, { text: "No" }]), input)).source).toBe("template");
  });

  it("no '?', 0 suggestions or fewer than 2 usable ⇒ template; more than 3 ⇒ first 3; > 40 chars dropped", async () => {
    const input = await heroInput();
    expect((await run(llmOut("Need express delivery.", [{ text: "Yes" }, { text: "No" }]), input)).source).toBe("template");
    expect((await run(llmOut("Need express delivery?", []), input)).source).toBe("template");
    expect((await run(llmOut("Need express delivery?", [{ text: "Yes" }]), input)).source).toBe("template");
    const many = await run(llmOut("Need express?", ["a", "b", "c", "d"].map((text) => ({ text }))), input);
    expect(many.suggestions.map((s) => s.text)).toEqual(["a", "b", "c"]);
    const long = await run(llmOut("Need express?", [{ text: "x".repeat(41) }, { text: "Yes" }, { text: "No" }]), input);
    expect(long.suggestions.map((s) => s.text)).toEqual(["Yes", "No"]);
  });

  it("LLM error ⇒ template; slower than the timeout ⇒ template", async () => {
    const input = await heroInput();
    expect(await followUp(new FakeLLM({ structured: [new Error("boom")] }), input)).toEqual(templateFollowUp(input));
    const slow = new FakeLLM({ structured: [fakeDelay(200, llmOut("Need express?", [{ text: "Yes" }, { text: "No" }]))] });
    const t0 = performance.now();
    const f = await followUp(slow, input, { timeoutMs: 30 });
    expect(f.source).toBe("template");
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

describe("templateFollowUp: first hook, vi + en", () => {
  it("hero (Lan, vi): the deadline_soon sentence of the contract", async () => {
    const f = templateFollowUp(await heroInput("vi"));
    expect(f).toEqual({
      question: "Còn 3 ngày nữa là khai giảng 5/9, bạn có muốn chuyển sang giao hoả tốc để chắc chắn nhận kịp không?",
      suggestions: [{ text: "Giao hoả tốc" }, { text: "Giữ như cũ" }],
      source: "template",
    });
  });

  it("no hooks ⇒ the generic question", async () => {
    const input = await heroInput("vi");
    const none = { ...input, context: { ...input.context, hooks: [] } };
    expect(templateFollowUp(none).question).toBe("Bạn muốn chỉnh gì thêm cho bộ đồ này không?");
    expect(templateFollowUp({ ...none, plan: { ...none.plan, language: "en" } }).question).toBe(
      "Anything you'd like to change in this kit?",
    );
  });

  const VI_CHARS = /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i;
  const HOOKS: SalesHook[] = ["deadline_soon", "cart_interest", "voucher_expiring", "freeship_gap", "favorite_shop_promo"];
  function only(ctx: SalesContext, hook: SalesHook): SalesContext {
    return {
      ...ctx,
      freeshipGaps: hook === "freeship_gap" ? [{ shopName: "Minh An Stationery", missing: 50_000 }] : ctx.freeshipGaps,
      hooks: [hook],
    };
  }
  for (const hook of HOOKS) {
    it(`${hook}: Vietnamese for vi, English for en, valid FollowUp`, async () => {
      for (const lang of ["vi", "en"] as const) {
        const input = await heroInput(lang);
        const f = templateFollowUp({ ...input, context: only(input.context, hook) });
        expect(FollowUpSchema.parse(f)).toEqual(f);
        expect(f.source).toBe("template");
        const text = [f.question, ...f.suggestions.map((s) => s.text)].join(" ");
        if (lang === "vi") expect(text).toMatch(VI_CHARS);
        else expect(text).not.toMatch(VI_CHARS);
        if (hook === "cart_interest") {
          expect(f.suggestions[0].action).toEqual({ type: "swap", itemKey: "backpack", productId: "prod-kidzone-lite-backpack" });
          expect(f.question).toContain("440.000₫");
        }
        if (hook === "voucher_expiring") expect(f.question).toContain("LAN-BTS10");
        if (hook === "freeship_gap") expect(f.question).toContain("50.000₫");
        if (hook === "favorite_shop_promo") expect(f.question).toContain("KidZone Mall");
      }
    });
  }
});
