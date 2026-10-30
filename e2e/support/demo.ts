// T14 (seam S7): pure helpers for the Playwright demo e2e — reading vi-VN money off the page and the Beat 3 backpack
// gap out of GET /api/seller/insights. No Playwright import here, so vitest unit-tests them (tests/ui/e2e-support.test.ts).
import type { InsightsResponse } from "@/contract";

/** The DEMO.md Beat 1 sentence (EN, the final round's language). */
export const HERO_EN = "My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.";
export const HERO_BUDGET = 1_500_000;
/** D36: Run → first basket line; fail above this, target ≤ 10 s. */
export const SPEED_LIMIT_MS = 20_000;
export const MINHAN_SHOP = "shop-minhan";
export const MINHAN_BACKPACK = "Minh An Kids Backpack New Model 2026";

/** "1.500.000 ₫" / "Grand total 880.000 ₫" / "−40.000 ₫" → the integer amount (sign dropped). */
export function parseVnd(text: string): number {
  const m = text.match(/(\d{1,3}(?:\.\d{3})+|\d+)\s*₫/);
  if (!m) throw new Error(`no amount in "${text}"`);
  return Number(m[1].replace(/\./g, ""));
}

/** The anti-hunchback school-backpack gap (Beat 3's listing gap), whatever other tags the seed gave it. */
export function backpackGap(insights: InsightsResponse): InsightsResponse["gaps"][number] | undefined {
  return insights.gaps.find((g) => g.category === "school-backpack" && g.tags.includes("anti-hunchback"));
}

/** Its "this week" count; 0 when the gap is below the insights threshold (or the seed is stale). */
export function backpackThisWeek(insights: InsightsResponse): number {
  return backpackGap(insights)?.thisWeek ?? 0;
}

export function slowerThan(limitMs: number, elapsedMs: number): boolean {
  return elapsedMs > limitMs;
}
