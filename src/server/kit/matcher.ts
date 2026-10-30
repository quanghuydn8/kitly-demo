// Matcher (PRD "Matcher", seam S5): plan → scored candidates per item. Pure code over ONE catalog query (D36).
// Filters: category, in stock, arrivesBy (today + shipDaysMax) ≤ deadline, every mustHaveTag, price ≤ maxUnitPrice.
// score = QUALITY only (CONTRACT §1): nice-to-have tags 0.35, rating 0.35, log review volume 0.18, shop tier 0.12.
// No exact candidate → reason code + closest (relax mustHaveTags, then maxUnitPrice; never deadline or stock).
import type { BasketOption, Candidate, CommerceAdapter, KitPlan, PlanItem, Product, Shop, ShopTier } from "@/contract";
import { addDays } from "@/server/today";

export type NoMatch = BasketOption["noMatch"][number];

export interface MatchResult {
  candidates: Record<string, Candidate[]>; // itemKey → exact candidates, best score first (absent = none)
  noMatch: NoMatch[];
  matchedCount: Record<string, number>; // itemKey → exact candidates (demand_items.matched_count)
  compared: { products: number; shops: number }; // what the one catalog query returned
}

const TIER: Record<ShopTier, number> = { mall: 1, preferred: 0.6, regular: 0.2 };

export function qualityScore(p: Product, s: Shop, it: PlanItem): number {
  const nice = it.niceToHaveTags.length ? it.niceToHaveTags.filter((t) => p.tags.includes(t)).length / it.niceToHaveTags.length : 1;
  const reviews = Math.min(1, Math.log10(1 + p.reviewCount) / 4);
  const score = 0.35 * nice + 0.35 * Math.min(1, p.rating / 5) + 0.18 * reviews + 0.12 * TIER[s.tier];
  return Math.round(Math.min(1, Math.max(0, score)) * 1e4) / 1e4;
}

function toCandidate(p: Product, s: Shop, it: PlanItem, today: string): Candidate {
  const wanted = [...it.mustHaveTags, ...it.niceToHaveTags];
  return {
    product: p,
    shop: s,
    score: qualityScore(p, s, it),
    matchedTags: [...new Set(wanted.filter((t) => p.tags.includes(t)))],
    arrivesBy: addDays(today, p.shipDaysMax),
  };
}

const best = (list: Candidate[]) =>
  [...list].sort((a, b) => b.score - a.score || a.product.price - b.product.price || a.product.id.localeCompare(b.product.id));

export async function matchPlan(
  adapter: CommerceAdapter,
  plan: KitPlan,
  opts: { shops: Shop[]; today: string },
): Promise<MatchResult> {
  const categories = [...new Set(plan.items.flatMap((i) => (i.category ? [i.category] : [])))];
  const products = categories.length ? await adapter.searchProducts({ categories }) : [];
  const shopById = new Map(opts.shops.map((s) => [s.id, s]));

  const result: MatchResult = {
    candidates: {},
    noMatch: [],
    matchedCount: {},
    compared: { products: products.length, shops: new Set(products.map((p) => p.shopId)).size },
  };

  for (const it of plan.items) {
    result.matchedCount[it.key] = 0;
    if (it.category === null) {
      result.noMatch.push({ itemKey: it.key, needLabel: it.needLabel, reason: "no_category", closest: null });
      continue;
    }
    // base = category ∧ in stock ∧ arrives in time: the part that is never relaxed
    const base: Candidate[] = [];
    for (const p of products) {
      const s = shopById.get(p.shopId);
      if (!s || p.category !== it.category || p.stock <= 0) continue;
      const c = toCandidate(p, s, it, opts.today);
      if (plan.deadline === null || c.arrivesBy <= plan.deadline) base.push(c);
    }
    const hasTags = (c: Candidate) => it.mustHaveTags.every((t) => c.product.tags.includes(t));
    const inPrice = (c: Candidate) => it.maxUnitPrice === null || c.product.price <= it.maxUnitPrice;
    const exact = best(base.filter((c) => hasTags(c) && inPrice(c)));
    if (exact.length) {
      result.candidates[it.key] = exact;
      result.matchedCount[it.key] = exact.length;
      continue;
    }
    // reason = the relaxation that found the closest (hero: relaxing anti-hunchback → no_product_with_tags)
    const relaxedTags = best(base.filter(inPrice))[0];
    const relaxedAll = relaxedTags ? undefined : best(base)[0];
    const reason: NoMatch["reason"] = !base.length
      ? "none_in_time"
      : relaxedTags
        ? "no_product_with_tags"
        : "none_in_budget";
    const pick = relaxedTags ?? relaxedAll;
    result.noMatch.push({
      itemKey: it.key,
      needLabel: it.needLabel,
      reason,
      closest: pick
        ? {
            candidate: pick,
            missingTags: it.mustHaveTags.filter((t) => !pick.product.tags.includes(t)),
            overMaxPriceBy:
              it.maxUnitPrice !== null && pick.product.price > it.maxUnitPrice ? pick.product.price - it.maxUnitPrice : null,
          }
        : null,
    });
  }
  return result;
}
