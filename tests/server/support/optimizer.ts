// Builders for Optimizer tests (S1): tiny hand-made worlds + the hero fixture world.
// The hero candidates are scored with the CONTRACT §1 quality formula here (Matcher = ticket 03); price never scores.
import type { Candidate, KitPlan, PlanItem, Product, Shop, ShopTier, Voucher } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import kitSample from "@/contract/fixtures/kit.sample.json";
import type { OptimizerInput } from "@/server/optimizer";
import { addDays } from "@/server/today";

export const TODAY = "2026-09-02";

export function shop(id: string, shipFee = 20_000, tier: ShopTier = "regular"): Shop {
  return { id, name: `Shop ${id}`, tier, rating: 4.5, shipFee, city: "Hanoi" };
}

export function item(key: string, over: Partial<PlanItem> = {}): PlanItem {
  return {
    key,
    needLabel: key[0].toUpperCase() + key.slice(1),
    category: `cat-${key}`,
    required: true,
    quantity: 1,
    mustHaveTags: [],
    niceToHaveTags: [],
    maxUnitPrice: null,
    ...over,
  };
}

export function plan(items: PlanItem[], budget: number | null, language: "en" | "vi" = "en"): KitPlan {
  return { event: "back_to_school", language, budget, deadline: "2026-09-05", items, assumptions: [] };
}

let seq = 0;
export function cand(s: Shop, price: number, score: number, over: Partial<Product> = {}): Candidate {
  seq += 1;
  const product: Product = {
    id: over.id ?? `p${seq}-${s.id}`,
    shopId: s.id,
    title: over.title ?? `Product ${seq} at ${s.id}`,
    category: "cat",
    description: "",
    price,
    rating: 4.5,
    reviewCount: 100,
    soldCount: 100,
    stock: 100,
    tags: [],
    attributes: {},
    shipDaysMin: 1,
    shipDaysMax: 2,
    updatedForDemandAt: null,
    ...over,
  };
  return { product, shop: s, score, matchedTags: [], arrivesBy: addDays(TODAY, product.shipDaysMax) };
}

export function voucher(v: Partial<Voucher> & Pick<Voucher, "code" | "scope" | "kind" | "value">): Voucher {
  return {
    id: `v-${v.code}`,
    shopId: null,
    maxDiscount: null,
    minSpend: 0,
    validUntil: "2026-09-30",
    ownerPersona: null,
    label: v.code,
    ...v,
  };
}

const FREESHIP = voucher({ code: "FREESHIP", scope: "platform", kind: "freeship", value: 30_000, minSpend: 200_000 });
export const freeship = () => ({ ...FREESHIP });

// ---- hero world (fixtures): kit.sample plan, products/shops/vouchers from the InMemoryAdapter ----
const TIER: Record<ShopTier, number> = { mall: 1, preferred: 0.6, regular: 0.2 };

export function qualityScore(p: Product, s: Shop, it: PlanItem): { score: number; matchedTags: string[] } {
  const matchedTags = it.niceToHaveTags.filter((t) => p.tags.includes(t));
  const tagPart = it.niceToHaveTags.length ? matchedTags.length / it.niceToHaveTags.length : 1;
  const reviews = Math.min(1, Math.log10(1 + p.reviewCount) / 4);
  const score = 0.35 * tagPart + 0.35 * (p.rating / 5) + 0.18 * reviews + 0.12 * TIER[s.tier];
  return { score: Math.round(score * 1e4) / 1e4, matchedTags };
}

export async function heroInput(budget: number | null, persona: "lan" | "guest" = "lan"): Promise<OptimizerInput> {
  const adapter = new InMemoryAdapter();
  const heroPlan = structuredClone(
    (kitSample as { event: string; data: { plan?: KitPlan } }[]).find((e) => e.event === "plan")!.data.plan!,
  );
  heroPlan.budget = budget;
  const shops = await adapter.listShops();
  const vouchers = await adapter.listVouchers(persona);
  const products = await adapter.searchProducts({ limit: 1000 });
  const candidates: Record<string, Candidate[]> = {};
  const noMatch: OptimizerInput["noMatch"] = [];
  for (const it of heroPlan.items) {
    const list = products
      .filter((p) => p.category === it.category && p.stock > 0)
      .filter((p) => addDays(TODAY, p.shipDaysMax) <= heroPlan.deadline!)
      .filter((p) => it.mustHaveTags.every((t) => p.tags.includes(t)))
      .filter((p) => it.maxUnitPrice === null || p.price <= it.maxUnitPrice)
      .map((p) => {
        const s = shops.find((x) => x.id === p.shopId)!;
        return { product: p, shop: s, ...qualityScore(p, s, it), arrivesBy: addDays(TODAY, p.shipDaysMax) };
      })
      .sort((a, b) => b.score - a.score);
    if (list.length) candidates[it.key] = list;
    else noMatch.push({ itemKey: it.key, needLabel: it.needLabel, reason: "no_product_with_tags", closest: null });
  }
  return { plan: heroPlan, candidates, noMatch, shops, vouchers, today: TODAY };
}

export const sumScore = (lines: { itemKey: string; product: Product }[], input: OptimizerInput) =>
  lines.reduce((s, l) => s + input.candidates[l.itemKey].find((c) => c.product.id === l.product.id)!.score, 0);
