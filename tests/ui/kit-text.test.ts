// F10: "No suitable product yet" sentence follows plan.language (vi must not mix an English frame with a vi label).
import { describe, expect, it } from "vitest";
import { kitSample } from "@/contract/fixtures";
import type { KitPlan } from "@/contract/types";
import { noMatchPrefix, noMatchReason } from "@/lib/client/kit-text";

const planEv = kitSample.find((e) => e.event === "plan")!;
if (planEv.event !== "plan") throw new Error("fixture");
const en: KitPlan = planEv.data.plan;
const vi: KitPlan = {
  ...en,
  language: "vi",
  deadline: "2026-08-25",
  items: [
    { ...en.items[0], key: "balo", needLabel: "Balo chống gù", maxUnitPrice: 400000, mustHaveTags: ["chong-gu", "leak-proof"] },
  ],
};
const entry = (reason: "no_category" | "no_product_with_tags" | "none_in_time" | "none_in_budget") => ({
  itemKey: "balo",
  needLabel: "Balo chống gù",
  reason,
});

describe("noMatchPrefix", () => {
  it("is English for en plans and Vietnamese for vi plans", () => {
    expect(noMatchPrefix(en)).toBe("No suitable product yet");
    expect(noMatchPrefix(null)).toBe("No suitable product yet");
    expect(noMatchPrefix(vi)).toBe("Chưa có sản phẩm phù hợp");
  });
});

describe("noMatchReason (vi)", () => {
  it("none_in_budget: no English frame", () => {
    expect(noMatchReason(entry("none_in_budget"), vi)).toBe("chưa có balo chống gù dưới 400.000₫");
  });
  it("none_in_budget without a price", () => {
    const p = { ...vi, items: [{ ...vi.items[0], maxUnitPrice: null }] };
    expect(noMatchReason(entry("none_in_budget"), p)).toBe("chưa có balo chống gù vừa ngân sách của bạn");
  });
  it("none_in_time", () => {
    expect(noMatchReason(entry("none_in_time"), vi)).toBe("chưa có balo chống gù giao kịp trước 25/08");
    expect(noMatchReason(entry("none_in_time"), { ...vi, deadline: null })).toBe("chưa có balo chống gù giao kịp");
  });
  it("no_category", () => {
    expect(noMatchReason(entry("no_category"), vi)).toBe("DemoMart chưa bán balo chống gù");
  });
  it("no_product_with_tags", () => {
    expect(noMatchReason(entry("no_product_with_tags"), vi)).toBe("chưa có balo chống gù có chong-gu, leak-proof");
    const p = { ...vi, items: [{ ...vi.items[0], mustHaveTags: [] }] };
    expect(noMatchReason(entry("no_product_with_tags"), p)).toBe("chưa có balo chống gù đúng yêu cầu của bạn");
  });
});

describe("noMatchReason (en) unchanged", () => {
  it("keeps the English wording", () => {
    expect(noMatchReason(entry("no_category"), en)).toBe("DemoMart does not sell balo chống gù yet");
  });
});
