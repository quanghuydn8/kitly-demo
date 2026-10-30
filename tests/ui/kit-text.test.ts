// Honest no-match sentences and small Kitly labels in the plan language (T11).
import { describe, expect, it } from "vitest";
import type { BasketOption, KitPlan } from "@/contract";
import {
  clarifyQuestion,
  kAmount,
  missingLabel,
  noMatchSentence,
  overMaxLabel,
  relativeTime,
} from "@/lib/client/kit-text";

type NoMatch = BasketOption["noMatch"][number];

const planEn: KitPlan = {
  event: "back_to_school",
  language: "en",
  budget: 1_500_000,
  deadline: "2026-09-05",
  assumptions: [],
  items: [
    {
      key: "backpack",
      needLabel: "Anti-hunchback backpack",
      category: "school-backpack",
      required: true,
      quantity: 1,
      mustHaveTags: ["anti-hunchback"],
      niceToHaveTags: [],
      maxUnitPrice: 400_000,
    },
    {
      key: "shoes",
      needLabel: "School shoes",
      category: "school-shoes",
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    },
  ],
};
const planVi: KitPlan = {
  ...planEn,
  language: "vi",
  items: [
    { ...planEn.items[0], needLabel: "Balo chống gù" },
    { ...planEn.items[1], needLabel: "Giày đi học" },
  ],
};

const row = (itemKey: string, needLabel: string, reason: NoMatch["reason"]): NoMatch => ({
  itemKey,
  needLabel,
  reason,
  closest: null,
});

describe("noMatchSentence", () => {
  it("English: names the need and the max price", () => {
    expect(noMatchSentence(row("backpack", "Anti-hunchback backpack", "no_product_with_tags"), planEn)).toBe(
      "No exact match: no anti-hunchback backpack under 400k",
    );
  });

  it("Vietnamese: same facts in the plan language", () => {
    expect(noMatchSentence(row("backpack", "Balo chống gù", "no_product_with_tags"), planVi)).toBe(
      "Chưa có balo chống gù dưới 400.000 ₫",
    );
  });

  it("deadline reason mentions the deadline; no max price ⇒ no price clause", () => {
    expect(noMatchSentence(row("shoes", "School shoes", "none_in_time"), planEn)).toBe(
      "No exact match: no school shoes arriving by Sep 5",
    );
    expect(noMatchSentence(row("shoes", "Giày đi học", "none_in_time"), planVi)).toBe(
      "Chưa có giày đi học giao kịp trước 5/9",
    );
  });
});

describe("labels", () => {
  it("formats short amounts, missing tags, over-max and the clarify question", () => {
    expect(kAmount(400_000)).toBe("400k");
    expect(kAmount(1_500_000)).toBe("1.5M");
    expect(kAmount(2_000_000)).toBe("2M");
    expect(missingLabel(["anti-hunchback", "lightweight"])).toBe("Missing: anti-hunchback, lightweight");
    expect(overMaxLabel(50_000)).toBe("Over your max price by 50.000 ₫");
    expect(clarifyQuestion("en")).toBe("What's your budget?");
    expect(clarifyQuestion("vi")).toMatch(/ngân sách/i);
  });

  it("relativeTime counts back from the given now", () => {
    const now = "2026-09-02T10:10:00.000Z";
    expect(relativeTime("2026-09-02T10:09:40.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-02T10:05:00.000Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-09-02T07:10:00.000Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-08-31T10:10:00.000Z", now)).toBe("2 days ago");
  });
});
