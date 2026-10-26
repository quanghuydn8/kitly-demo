// Pure view helpers for the seller screen: KPI strip, week-over-week trend, "shops selling" copy, bar widths.
import type { Gap, InsightsResponse } from "@/contract/types";

/** Rounded % change vs last week; null when last week had nothing to compare with. */
export function trendPct(thisWeek: number, lastWeek: number): number | null {
  if (lastWeek === 0) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
}

/** "▲ 76%", "▼ 10%", "0%", "New" (nothing last week), "—" (nothing at all). */
export function formatTrend(thisWeek: number, lastWeek: number): string {
  const p = trendPct(thisWeek, lastWeek);
  if (p === null) return thisWeek > 0 ? "New" : "—";
  if (p > 0) return `▲ ${p}%`;
  if (p < 0) return `▼ ${-p}%`;
  return "0%";
}

/** KPI strip: unmet needs = sum of gap counts; searches this week = sum of top needs (sessions per event). */
export function sellerKpis(ins: InsightsResponse) {
  const unmetThisWeek = ins.gaps.reduce((s, g) => s + g.thisWeek, 0);
  const unmetLastWeek = ins.gaps.reduce((s, g) => s + g.lastWeek, 0);
  const searchesThisWeek = ins.topNeeds.reduce((s, n) => s + n.count, 0);
  return { unmetThisWeek, unmetLastWeek, searchesThisWeek, trend: formatTrend(unmetThisWeek, unmetLastWeek) };
}

/** Assortment-gap supply line. The contract only counts matching products, so 0 ⇒ "0 shops selling". */
export function sellingCopy(gap: Gap): string {
  const n = gap.matchingProducts;
  if (n === 0) return "0 shops selling";
  return `${n} matching product${n === 1 ? "" : "s"} on DemoMart`;
}

/** Bar widths in % of the largest count (non-zero bars stay visible at ≥ 2%). */
export function barWidths(counts: number[]): number[] {
  const max = Math.max(0, ...counts);
  return counts.map((c) => (c <= 0 || max === 0 ? 0 : Math.max(2, Math.round((c / max) * 100))));
}
