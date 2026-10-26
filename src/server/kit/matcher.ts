// Matcher (PRD "Matcher", seam S5): plan items + CommerceAdapter → scored candidates per item. Pure code, no LLM.
// Filters, in order (the first filter that empties an item names the noMatch reason):
//   category (null → no_category) + in stock → all mustHaveTags (no_product_with_tags)
//   → arrivesBy = today + shipDaysMax ≤ deadline (none_in_time) → price ≤ maxUnitPrice (none_in_budget).
// Score in [0,1]: nice-to-have tag match, rating, log review volume, shop tier, price fit (cheapest / price).
import type { Candidate, CommerceAdapter, KitPlan, PlanItem, Product, Shop, ShopTier } from "@/contract";
import type { NoMatchReason } from "@/server/optimizer";
import { addDays } from "@/server/today";

export interface ItemMatch {
  candidates: Candidate[]; // best-first
  reason: NoMatchReason | null; // set iff candidates is empty
}

export interface PlanMatch {
  byItem: Record<string, ItemMatch>;
  /** Distinct in-category products looked at, and the shops they belong to (timeline detail). */
  productsCompared: number;
  shopsCompared: number;
}

const WEIGHTS = { tags: 0.3, rating: 0.3, reviews: 0.15, tier: 0.1, price: 0.15 };
const TIER: Record<ShopTier, number> = { mall: 1, preferred: 0.7, regular: 0.4 };
const SEARCH_LIMIT = 500;

function score(item: PlanItem, p: Product, shop: Shop, cheapest: number): { score: number; matchedTags: string[] } {
  const nice = item.niceToHaveTags.filter((t) => p.tags.includes(t));
  const tagFit = item.niceToHaveTags.length === 0 ? 1 : nice.length / item.niceToHaveTags.length;
  const raw =
    WEIGHTS.tags * tagFit +
    WEIGHTS.rating * Math.min(1, Math.max(0, p.rating / 5)) +
    WEIGHTS.reviews * Math.min(1, Math.log10(1 + Math.max(0, p.reviewCount)) / 4) +
    WEIGHTS.tier * TIER[shop.tier] +
    WEIGHTS.price * (p.price > 0 ? Math.min(1, cheapest / p.price) : 1);
  const matchedTags = [...item.mustHaveTags, ...nice];
  return { score: Math.round(raw * 1000) / 1000, matchedTags };
}

function matchItem(item: PlanItem, inCategory: Product[], shops: Map<string, Shop>, today: string, deadline: string | null): ItemMatch {
  if (item.category === null) return { candidates: [], reason: "no_category" };
  const stages: [NoMatchReason, (p: Product) => boolean][] = [
    ["no_product_with_tags", (p) => p.stock > 0 && shops.has(p.shopId) && item.mustHaveTags.every((t) => p.tags.includes(t))],
    ["none_in_time", (p) => deadline === null || addDays(today, p.shipDaysMax) <= deadline],
    ["none_in_budget", (p) => item.maxUnitPrice === null || p.price <= item.maxUnitPrice],
  ];
  let pool = inCategory;
  for (const [reason, keep] of stages) {
    pool = pool.filter(keep);
    if (pool.length === 0) return { candidates: [], reason };
  }
  const cheapest = Math.min(...pool.map((p) => p.price));
  const candidates = pool
    .map((p): Candidate => {
      const shop = shops.get(p.shopId)!;
      return { product: p, shop, ...score(item, p, shop, cheapest), arrivesBy: addDays(today, p.shipDaysMax) };
    })
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price || a.product.id.localeCompare(b.product.id));
  return { candidates, reason: null };
}

export async function matchPlan(adapter: CommerceAdapter, plan: KitPlan, today: string): Promise<PlanMatch> {
  const categories = [...new Set(plan.items.flatMap((i) => (i.category === null ? [] : [i.category])))];
  const [shopList, perCategory] = await Promise.all([
    adapter.listShops(),
    Promise.all(categories.map((category) => adapter.searchProducts({ category, limit: SEARCH_LIMIT }))),
  ]);
  const shops = new Map(shopList.map((s) => [s.id, s]));
  const byCategory = new Map(categories.map((c, i) => [c, perCategory[i].filter((p) => p.category === c)]));

  const byItem: Record<string, ItemMatch> = {};
  for (const item of plan.items) {
    byItem[item.key] = matchItem(item, byCategory.get(item.category ?? "") ?? [], shops, today, plan.deadline);
  }
  const compared = [...byCategory.values()].flat();
  return {
    byItem,
    productsCompared: new Set(compared.map((p) => p.id)).size,
    shopsCompared: new Set(compared.map((p) => p.shopId)).size,
  };
}
