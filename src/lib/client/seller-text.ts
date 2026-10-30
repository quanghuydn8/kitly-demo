// Seller Intelligence display helpers (T12): pure, no React. Copy rules from kit/tickets/12-seller-screen.md.
import type { CategoryId, Gap, InsightsResponse } from "@/contract";

export interface Trend {
  text: string; // "▲81%", "▼50%", "—0%", "▲ New"
  dir: "up" | "down" | "flat";
}

/** This week vs last week. Last week 0 with demand now = "New" (a percentage of 0 is meaningless). */
export function trendLabel(thisWeek: number, lastWeek: number): Trend {
  if (lastWeek === 0) return thisWeek > 0 ? { text: "▲ New", dir: "up" } : { text: "—0%", dir: "flat" };
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  if (pct > 0) return { text: `▲${pct}%`, dir: "up" };
  if (pct < 0) return { text: `▼${-pct}%`, dir: "down" };
  return { text: "—0%", dir: "flat" };
}

/**
 * Supply line under a gap. A listing gap is about listings that WOULD match once fixed (its candidates), never
 * "Supply: N matching product" (ticket 12). An assortment gap with no matching product says "0 shops selling".
 */
export function supplyLine(g: Pick<Gap, "type" | "matchingProducts" | "candidates" | "appliedFix">): string {
  if (g.type === "listing_gap") {
    // After Apply the gap stays a listing gap with candidates [] (CONTRACT appliedFix rule): the fix is the supply.
    if (g.appliedFix) return "Your listing now matches this need";
    const n = g.candidates?.length ?? 0;
    return n === 1 ? "1 listing could match if its tags were fixed" : `${n} listings could match if their tags were fixed`;
  }
  if (g.matchingProducts === 0) return "0 shops selling";
  return g.matchingProducts === 1 ? "1 matching product" : `${g.matchingProducts} matching products`;
}

/**
 * "Now" on the demo clock: DEMO_TODAY + the wall-clock time of day. Live demand rows are stamped the same way
 * (server `demoNowIso`), so ages must be measured against this, never against the raw wall clock.
 */
export function demoNowMs(demoToday: string, wallMs: number): number {
  return Date.parse(demoToday.slice(0, 10) + new Date(wallMs).toISOString().slice(10));
}

/** Age for the live strip ("2 min ago"); pass `nowMs` from demoNowMs. */
export function agoLabel(createdAt: string, nowMs: number): string {
  const sec = Math.max(0, (nowMs - Date.parse(createdAt)) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export interface Kpis {
  unmetThisWeek: number; // Σ thisWeek of the gaps shown
  searchesThisWeek: number; // Σ topNeeds (distinct kit sessions this week, marketplace-wide)
  trend: Trend; // gaps' this week vs last week
}

export function kpis(r: InsightsResponse): Kpis {
  const unmet = r.gaps.reduce((s, g) => s + g.thisWeek, 0);
  const last = r.gaps.reduce((s, g) => s + g.lastWeek, 0);
  return {
    unmetThisWeek: unmet,
    searchesThisWeek: r.topNeeds.reduce((s, t) => s + t.count, 0),
    trend: trendLabel(unmet, last),
  };
}

/**
 * The insights gap key for a buyer's unmet plan item (mirrors src/server/insights/aggregate.ts `gapKey`: demand rows
 * store the item's mustHaveTags). Used by the buyer-side Notify me so Seller Centre counts it on the same gap.
 */
export function demandGapKey(item: { category: CategoryId | null; mustHaveTags: string[] }): string {
  return item.category === null ? "none|" : `${item.category}|${[...item.mustHaveTags].sort().join(",")}`;
}
