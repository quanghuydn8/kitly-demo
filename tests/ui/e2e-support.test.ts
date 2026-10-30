// T14: pure helpers the Playwright demo e2e (e2e/demo.spec.ts) relies on to read money and seller counts from the app.
import { describe, expect, it } from "vitest";
import { insights } from "./seller-fixture";
import { backpackGap, backpackThisWeek, parseVnd, slowerThan } from "../../e2e/support/demo";

describe("parseVnd", () => {
  it("reads the vi-VN money the UI prints", () => {
    expect(parseVnd("1.500.000 ₫")).toBe(1_500_000);
    expect(parseVnd("349.000 ₫")).toBe(349_000);
    expect(parseVnd("Grand total 880.000 ₫")).toBe(880_000);
    expect(parseVnd("−40.000 ₫")).toBe(40_000);
  });

  it("throws when there is no amount (a silent 0 would pass every ≤ budget check)", () => {
    expect(() => parseVnd("Grand total")).toThrow(/no amount/i);
  });
});

const insightsSample = insights();

describe("backpackGap / backpackThisWeek", () => {
  it("finds the anti-hunchback school-backpack gap and its weekly count", () => {
    const g = backpackGap(insightsSample);
    expect(g?.category).toBe("school-backpack");
    expect(g?.tags).toContain("anti-hunchback");
    expect(backpackThisWeek(insightsSample)).toBe(g!.thisWeek);
  });

  it("counts 0 when the gap is not in the insights (a stale seed must still give a baseline)", () => {
    expect(backpackGap({ ...insightsSample, gaps: [] })).toBeUndefined();
    expect(backpackThisWeek({ ...insightsSample, gaps: [] })).toBe(0);
  });
});

describe("slowerThan", () => {
  it("says when the hero sentence took longer than the D36 limit", () => {
    expect(slowerThan(20_000, 20_001)).toBe(true);
    expect(slowerThan(20_000, 20_000)).toBe(false);
  });
});
