// Seller screen text helpers (T12): trend, supply line, "2 min ago", KPIs, and the buyer-side gap key for Notify me.
import { describe, expect, it } from "vitest";
import { agoLabel, demandGapKey, demoNowMs, kpis, supplyLine, trendLabel } from "@/lib/client/seller-text";
import { insights } from "./seller-fixture";

describe("trendLabel", () => {
  it("▲ percent up, ▼ percent down, — flat, New when last week was 0", () => {
    expect(trendLabel(38, 21)).toEqual({ text: "▲81%", dir: "up" });
    expect(trendLabel(10, 20)).toEqual({ text: "▼50%", dir: "down" });
    expect(trendLabel(5, 5)).toEqual({ text: "—0%", dir: "flat" });
    expect(trendLabel(5, 0)).toEqual({ text: "▲ New", dir: "up" });
  });
});

describe("supplyLine", () => {
  it("listing gaps talk about listings that could match, never 'Supply: N matching product'", () => {
    expect(supplyLine({ type: "listing_gap", matchingProducts: 0, appliedFix: null, candidates: [{ productId: "a", title: "A", evidence: "x" }] })).toBe(
      "1 listing could match if its tags were fixed",
    );
    expect(
      supplyLine({
        type: "listing_gap",
        matchingProducts: 0,
        appliedFix: null,
        candidates: [
          { productId: "a", title: "A", evidence: "x" },
          { productId: "b", title: "B", evidence: "y" },
        ],
      }),
    ).toBe("2 listings could match if their tags were fixed");
  });

  it("a fixed listing gap (API sends candidates: []) says the listing now matches, never '0 listings could match'", () => {
    const appliedFix = { productId: "a", title: "A", appliedAt: "2026-09-02T09:00:00Z" };
    expect(supplyLine({ type: "listing_gap", matchingProducts: 1, candidates: [], appliedFix })).toBe("Your listing now matches this need");
  });

  it("assortment gaps: '0 shops selling' when nothing matches, else the matching product count", () => {
    expect(supplyLine({ type: "assortment_gap", matchingProducts: 0, appliedFix: null })).toBe("0 shops selling");
    expect(supplyLine({ type: "assortment_gap", matchingProducts: 1, appliedFix: null })).toBe("1 matching product");
    expect(supplyLine({ type: "assortment_gap", matchingProducts: 3, appliedFix: null })).toBe("3 matching products");
  });
});

describe("agoLabel", () => {
  const now = Date.parse("2026-09-02T10:00:00.000Z");
  it("just now / N min ago / N h ago / N d ago", () => {
    expect(agoLabel("2026-09-02T09:59:40.000Z", now)).toBe("just now");
    expect(agoLabel("2026-09-02T09:58:00.000Z", now)).toBe("2 min ago");
    expect(agoLabel("2026-09-02T07:00:00.000Z", now)).toBe("3 h ago");
    expect(agoLabel("2026-08-30T10:00:00.000Z", now)).toBe("3 d ago");
    expect(agoLabel("2026-09-02T10:05:00.000Z", now)).toBe("just now"); // clock skew never shows a negative age
  });
});

describe("kpis", () => {
  it("unmet = Σ gap thisWeek, searches = Σ topNeeds, trend over the gaps' weeks", () => {
    const k = kpis(insights());
    expect(k.unmetThisWeek).toBe(38 + 52 + 5);
    expect(k.searchesThisWeek).toBe(120);
    expect(k.trend).toEqual(trendLabel(95, 61));
  });
});

describe("demandGapKey", () => {
  it("matches the insights key: category + sorted must-have tags, null category → none|", () => {
    expect(demandGapKey({ category: "school-backpack", mustHaveTags: ["lightweight", "anti-hunchback"] })).toBe(
      "school-backpack|anti-hunchback,lightweight",
    );
    expect(demandGapKey({ category: null, mustHaveTags: ["x"] })).toBe("none|");
  });
});

describe("demoNowMs", () => {
  it("DEMO_TODAY + the wall-clock time of day (the clock live demand rows are stamped with, demoNowIso)", () => {
    const wall = Date.parse("2026-10-31T09:58:30.000Z");
    expect(new Date(demoNowMs("2026-09-02", wall)).toISOString()).toBe("2026-09-02T09:58:30.000Z");
    // a live row recorded 2 minutes earlier on the demo clock reads "2 min ago", not "59 d ago"
    expect(agoLabel("2026-09-02T09:56:30.000Z", demoNowMs("2026-09-02", wall))).toBe("2 min ago");
  });
});
