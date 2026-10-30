// Seller insights (CONTRACT §3 GET /api/seller/insights, seam S3): demand rows → visible gaps (thisWeek ≥ 3),
// classified listing / assortment for the shop, sorted, top 8, each with cached advice; + combos, top needs and
// the live "Just searched" strip (D35); Full: `watchers` = Notify-me watches per gap key (ticket 07).
// All marketplace data via the CommerceAdapter; all LLM calls via LLMClient.
import type { CommerceAdapter, InsightsResponse, Product } from "@/contract";
import type { AdviceStore } from "@/server/advicestore";
import type { LLMClient } from "@/server/llm";
import type { WatchStore } from "@/server/watchstore";
import { adviceFor } from "./advice";
import { aggregate, gapKey, insightWindow, UNMET_BELOW, VISIBLE_FROM, type GapStats } from "./aggregate";
import { classifyGaps, type Classification, type JudgeCache } from "./classify";

export { type JudgeCache } from "./classify";

export const MAX_GAPS = 8;
export const RECENT_MAX = 10;
const RECENT_FETCH = 200; // live rows read to find the 10 newest UNMET ones

export class UnknownShopError extends Error {
  constructor(shopId: string) {
    super(`Unknown shop ${shopId}`);
    this.name = "UnknownShopError";
  }
}

export interface InsightsDeps {
  adapter: CommerceAdapter;
  llm: LLMClient;
  advice: AdviceStore;
  watches: WatchStore;
  today: string;
  judgeCache?: JudgeCache;
}

type Ranked = GapStats & { matchingProducts: number } & Partial<Classification>;
const byThisWeek = (a: Ranked, b: Ranked) => b.thisWeek - a.thisWeek || a.key.localeCompare(b.key);
const listingFirst = (a: Ranked, b: Ranked) =>
  Number(a.type !== "listing_gap") - Number(b.type !== "listing_gap") || byThisWeek(a, b);

function matching(gap: GapStats, products: Product[]): number {
  if (gap.category === null) return 0;
  return products.filter((p) => p.category === gap.category && p.stock > 0 && gap.tags.every((t) => p.tags.includes(t)))
    .length;
}

/** shopId = a shop id or "all". Throws UnknownShopError for an unknown shop. */
export async function buildInsights(deps: InsightsDeps, shopId: string): Promise<InsightsResponse> {
  const { adapter, llm } = deps;
  const window = insightWindow(deps.today);
  const [shops, rows, live] = await Promise.all([
    adapter.listShops(),
    adapter.demandItemsSince(window.lastWeekFrom),
    adapter.recentDemandItems(RECENT_FETCH),
  ]);
  if (shopId !== "all" && !shops.some((s) => s.id === shopId)) throw new UnknownShopError(shopId);

  const agg = aggregate(rows, window);
  const visible = agg.gaps.filter((g) => g.thisWeek >= VISIBLE_FROM);
  const categories = [...new Set(visible.flatMap((g) => (g.category ? [g.category] : [])))];
  const products = categories.length ? await adapter.searchProducts({ categories }) : [];
  let ranked: Ranked[] = visible.map((g) => ({ ...g, matchingProducts: matching(g, products) }));

  // "all" sorts by thisWeek only, so only the top 8 need classifying; a shop's order depends on the type.
  if (shopId === "all") ranked = ranked.sort(byThisWeek).slice(0, MAX_GAPS);
  const classes = await classifyGaps(ranked, products, shopId, llm, deps.judgeCache);
  ranked = ranked.map((g) => ({ ...g, ...classes.get(g.key)! }));
  if (shopId !== "all") ranked = ranked.sort(listingFirst).slice(0, MAX_GAPS);

  const [advice, watchers] = await Promise.all([
    adviceFor(ranked, llm, deps.advice),
    deps.watches.counts(ranked.map((g) => g.key)),
  ]);
  const gaps: InsightsResponse["gaps"] = ranked.map((g, i) => ({
    key: g.key,
    type: g.type ?? "assortment_gap",
    needLabel: g.needLabel,
    category: g.category,
    tags: g.tags,
    thisWeek: g.thisWeek,
    lastWeek: g.lastWeek,
    matchingProducts: g.matchingProducts,
    priceBand: g.priceBand,
    neededWith: g.neededWith,
    advice: advice[i],
    ...(g.type === "listing_gap" ? { candidates: g.candidates ?? [] } : {}),
    appliedFix: g.appliedFix ?? null,
    watchers: watchers.get(g.key) ?? 0,
  }));

  // a live item of a known gap is named like that gap's card (the planner's own label varies: "School backpack",
  // "Balo chống gù"); null-category items keep their own label (the gap name is a "Not in catalog: …" summary)
  const gapName = new Map(agg.gaps.filter((g) => g.category !== null).map((g) => [g.key, g.needLabel]));
  const recent = live
    .filter((r) => r.source === "live" && r.matchedCount < UNMET_BELOW)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_MAX)
    .map((r) => ({
      needLabel: (r.category !== null && gapName.get(gapKey(r.category, r.tags))) || r.needLabel,
      category: r.category,
      tags: r.tags,
      event: r.event,
      createdAt: r.createdAt,
    }));

  return { window, gaps, combos: agg.combos, topNeeds: agg.topNeeds, recent };
}
