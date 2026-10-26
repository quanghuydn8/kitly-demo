// Seam: pure seller-screen view helpers (src/lib/client/seller-view.ts): KPI strip, ▲/▼ trend, shops-selling copy,
// top-needs bar widths.
import { describe, expect, it } from "vitest";
import type { Gap, InsightsResponse } from "@/contract/types";
import { barWidths, formatTrend, sellingCopy, sellerKpis, trendPct } from "@/lib/client/seller-view";

const gap = (over: Partial<Gap>): Gap => ({
  key: "k|t",
  type: "assortment_gap",
  needLabel: "Need",
  category: "kids-raincoat",
  tags: [],
  thisWeek: 0,
  lastWeek: 0,
  matchingProducts: 0,
  priceBand: null,
  neededWith: [],
  advice: "",
  ...over,
});

describe("trend", () => {
  it("is the rounded % change vs last week, null when last week had nothing", () => {
    expect(trendPct(37, 21)).toBe(76);
    expect(trendPct(9, 10)).toBe(-10);
    expect(trendPct(5, 0)).toBeNull();
    expect(trendPct(0, 0)).toBeNull();
  });
  it("formats ▲ up, ▼ down, flat and new", () => {
    expect(formatTrend(37, 21)).toBe("▲ 76%");
    expect(formatTrend(9, 10)).toBe("▼ 10%");
    expect(formatTrend(4, 4)).toBe("0%");
    expect(formatTrend(5, 0)).toBe("New");
    expect(formatTrend(0, 0)).toBe("—");
  });
});

describe("sellerKpis", () => {
  it("sums unmet needs this/last week over gaps and total searches over top needs", () => {
    const ins: InsightsResponse = {
      window: { thisWeekFrom: "2026-08-14", lastWeekFrom: "2026-08-07", today: "2026-08-20" },
      gaps: [gap({ thisWeek: 37, lastWeek: 21 }), gap({ thisWeek: 52, lastWeek: 30 })],
      combos: [],
      topNeeds: [
        { event: "back_to_school", count: 120 },
        { event: "other", count: 3 },
      ],
    };
    expect(sellerKpis(ins)).toEqual({
      unmetThisWeek: 89,
      unmetLastWeek: 51,
      searchesThisWeek: 123,
      trend: "▲ 75%",
    });
  });
});

describe("sellingCopy", () => {
  it("says 0 shops selling when nothing on DemoMart matches", () => {
    expect(sellingCopy(gap({ matchingProducts: 0 }))).toBe("0 shops selling");
    expect(sellingCopy(gap({ matchingProducts: 1 }))).toBe("1 matching product on DemoMart");
    expect(sellingCopy(gap({ matchingProducts: 3 }))).toBe("3 matching products on DemoMart");
  });
});

describe("barWidths", () => {
  it("scales counts to % of the largest, at least 2% for non-zero", () => {
    expect(barWidths([50, 25, 0, 1])).toEqual([100, 50, 0, 2]);
    expect(barWidths([])).toEqual([]);
  });
});
