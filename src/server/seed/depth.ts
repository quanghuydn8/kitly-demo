// Depth rule (DATA.md §3, D45) + express rule (§4), applied by code to every LLM-generated category:
//   count   ≥ 5 in-stock products with shipDaysMax ≤ 3 (they arrive before Sep 5 from DEMO_TODAY)
//   spread  among those, the most expensive costs ≥ 2.5× the cheapest
//   quality ≥ 1 of those in the top price third has rating ≥ 4.8 or is sold by a mall shop
//   express ≥ 1 in-stock product with shipDaysMax ≤ 2
// Fixes, in order: express (best-rated in-stock → 1–2 days), shorten slow in-stock products, plant code-written
// fill products. Planted products never carry gap tags.
import type { Product, Shop } from "@/contract";
import { categoryById } from "@/contract";

export type DepthProblem = "count" | "spread" | "quality" | "express";

const FAST_DAYS = 3;
const EXPRESS_DAYS = 2;
const MIN_FAST = 5;
const SPREAD = 2.5;
const GAP_TAGS = new Set(["anti-hunchback", "backpack-cover", "anti-blue-light"]);

const fastSet = (ps: Product[]) => ps.filter((p) => p.stock > 0 && p.shipDaysMax <= FAST_DAYS);
const round1k = (n: number) => Math.round(n / 1000) * 1000;

function topThirdHasQuality(fast: Product[], shops: Map<string, Shop>): boolean {
  const byPrice = [...fast].sort((a, b) => b.price - a.price);
  return byPrice
    .slice(0, Math.ceil(byPrice.length / 3))
    .some((p) => p.rating >= 4.8 || shops.get(p.shopId)?.tier === "mall");
}

export function depthProblems(products: Product[], shops: Shop[]): DepthProblem[] {
  const byId = new Map(shops.map((s) => [s.id, s]));
  const fast = fastSet(products);
  const out: DepthProblem[] = [];
  if (fast.length < MIN_FAST) out.push("count");
  const prices = fast.map((p) => p.price);
  if (!fast.length || Math.max(...prices) < SPREAD * Math.min(...prices)) out.push("spread");
  if (!fast.length || !topThirdHasQuality(fast, byId)) out.push("quality");
  if (!products.some((p) => p.stock > 0 && p.shipDaysMax <= EXPRESS_DAYS)) out.push("express");
  return out;
}

/**
 * Returns the category's products with the rules satisfied. `shops` = the shops that carry this category
 * (fill products are assigned to them; premium fills prefer a mall shop).
 */
export function enforceDepth(products: Product[], ctx: { category: string; shops: Shop[] }): Product[] {
  const out = structuredClone(products);
  const { category, shops } = ctx;
  if (!depthProblems(out, shops).length) return out;

  // express: best-rated in-stock product ships in 1–2 days
  const inStock = out.filter((p) => p.stock > 0);
  if (!inStock.some((p) => p.shipDaysMax <= EXPRESS_DAYS) && inStock.length) {
    const best = [...inStock].sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)[0];
    best.shipDaysMin = 1;
    best.shipDaysMax = EXPRESS_DAYS;
  }

  // count: shorten the best-rated slow in-stock products first
  const slow = inStock.filter((p) => p.shipDaysMax > FAST_DAYS).sort((a, b) => b.rating - a.rating);
  for (const p of slow) {
    if (fastSet(out).length >= MIN_FAST) break;
    p.shipDaysMin = Math.min(p.shipDaysMin, 2);
    p.shipDaysMax = FAST_DAYS;
  }

  const filler = makeFiller(out, category, shops);
  // count: plant mid-range fills
  while (fastSet(out).length < MIN_FAST) {
    const prices = fastSet(out).map((p) => p.price);
    const base = prices.length ? Math.min(...prices) : 200000;
    const n = fastSet(out).length;
    out.push(filler("standard", round1k(base * (1 + 0.25 * n))));
  }

  // spread: plant a premium product ≥ 2.5× the cheapest fast one
  {
    const prices = fastSet(out).map((p) => p.price);
    if (Math.max(...prices) < SPREAD * Math.min(...prices)) {
      out.push(filler("premium", Math.ceil((SPREAD * Math.min(...prices) * 1.1) / 1000) * 1000));
    }
  }

  // quality: plant a top-priced premium product with a top rating at a mall shop when possible
  if (!topThirdHasQuality(fastSet(out), new Map(shops.map((s) => [s.id, s])))) {
    const max = Math.max(...fastSet(out).map((p) => p.price));
    out.push(filler("premium", round1k(max * 1.15)));
  }
  return out;
}

function makeFiller(existing: Product[], category: string, shops: Shop[]) {
  const label = categoryById(category)?.label ?? category;
  const tagCount = new Map<string, number>();
  for (const p of existing)
    for (const t of p.tags)
      if (!GAP_TAGS.has(t) && t !== "premium" && t !== "budget") tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const common = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  const byTier = (tier: Shop["tier"]) => shops.filter((s) => s.tier === tier);
  let n = 0;

  return (kind: "standard" | "premium", price: number): Product => {
    n++;
    const pool =
      kind === "premium"
        ? [...byTier("mall"), ...byTier("preferred"), ...byTier("regular")]
        : [...byTier("regular"), ...byTier("preferred"), ...byTier("mall")];
    const shop = pool.length ? pool[(n - 1) % Math.min(pool.length, 2)] : null;
    const name = kind === "premium" ? `${label} Pro Edition` : `${label} Everyday ${n}`;
    const premium = kind === "premium";
    let id = `prod-${category}-fill-${n}`;
    while (existing.some((p) => p.id === id)) id += "x";
    return {
      id,
      shopId: shop?.id ?? "",
      title: `${shop?.name ?? "DemoMart"} ${name}`,
      category,
      description:
        `${label} from ${shop?.name ?? "DemoMart"}, ${premium ? "built with upgraded materials for daily heavy use" : "a reliable pick for everyday use"}. ` +
        `Ships from ${shop?.city ?? "Hanoi"} within 1–2 days. Comes with a ${premium ? 24 : 12}-month shop warranty and 7-day free returns.`,
      price,
      rating: premium ? 4.9 : 4.5,
      reviewCount: premium ? 640 : 180,
      soldCount: premium ? 1800 : 520,
      stock: premium ? 60 : 120,
      tags: [...common.slice(0, 2), ...(premium ? ["premium"] : [])],
      attributes: { warranty: `${premium ? 24 : 12} months`, origin: "Vietnam" },
      shipDaysMin: 1,
      shipDaysMax: EXPRESS_DAYS,
      updatedForDemandAt: null,
    };
  };
}
