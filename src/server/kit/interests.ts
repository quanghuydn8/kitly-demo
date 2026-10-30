// 💛 "In your cart" interests (D40, CONTRACT Interest, seam S10). Pure code: for each product in the persona's cart
// whose category equals a plan item's category, that is in stock, arrives by the deadline and is NOT the product the
// option already chose. Tags and maxUnitPrice are ignored (the buyer already wanted it); what it lacks is reported.
// `candidatesByItem` = the Matcher's relaxed pool (MatchResult.pool: category ∧ in stock ∧ arrives in time).
import type { BasketOption, Candidate, KitPlan, Persona, Product, Voucher } from "@/contract";

/** Discount of one fixed/percent voucher on `base` (integer VND, floored), as the Optimizer's pricer does. */
function discountOf(v: Voucher, base: number): number {
  if (v.kind === "fixed") return Math.min(v.value, base);
  if (v.kind === "percent") {
    const raw = Math.floor((base * v.value) / 100);
    return v.maxDiscount === null ? raw : Math.min(raw, v.maxDiscount);
  }
  return 0;
}

/**
 * Best single voucher usable on this product bought alone: a voucher of its shop (public or wallet) or a wallet
 * platform voucher. Freeship never counts (it is not a price). Ties → lower id (deterministic).
 */
export function bestSingleVoucher(product: Product, vouchers: Voucher[], today: string): { code: string; amount: number } | null {
  let best: { v: Voucher; amount: number } | null = null;
  for (const v of vouchers) {
    if (v.kind === "freeship" || v.validUntil < today || product.price < v.minSpend) continue;
    const usable = v.scope === "shop" ? v.shopId === product.shopId : v.ownerPersona !== null;
    if (!usable) continue;
    const amount = discountOf(v, product.price);
    if (amount <= 0) continue;
    if (!best || amount > best.amount || (amount === best.amount && v.id < best.v.id)) best = { v, amount };
  }
  return best ? { code: best.v.code, amount: best.amount } : null;
}

export function findInterests(
  plan: KitPlan,
  option: Pick<BasketOption, "lines">,
  candidatesByItem: Record<string, Candidate[]>,
  persona: Persona,
  vouchers: Voucher[],
  today: string,
): NonNullable<BasketOption["interests"]> {
  if (persona.id === "guest") return [];
  const inLines = new Set(option.lines.map((l) => l.product.id));
  const out: NonNullable<BasketOption["interests"]> = [];
  for (const entry of persona.cart) {
    if (inLines.has(entry.productId)) continue;
    for (const item of plan.items) {
      if (item.category === null) continue;
      const c = (candidatesByItem[item.key] ?? []).find((x) => x.product.id === entry.productId);
      if (!c || c.product.category !== item.category || c.product.stock <= 0) continue;
      if (plan.deadline !== null && c.arrivesBy > plan.deadline) continue;
      const voucher = bestSingleVoucher(c.product, vouchers, today);
      const priceAfterVoucher = c.product.price - (voucher?.amount ?? 0);
      out.push({
        itemKey: item.key,
        candidate: c,
        addedToCartAt: entry.addedAt,
        walletVoucherCode: voucher?.code ?? null,
        priceAfterVoucher,
        overMaxPriceBy: item.maxUnitPrice !== null && priceAfterVoucher > item.maxUnitPrice ? priceAfterVoucher - item.maxUnitPrice : null,
        missingTags: item.mustHaveTags.filter((t) => !c.product.tags.includes(t)),
      });
      break; // one card per cart product: the first plan item it fits
    }
  }
  return out;
}

/** The options with their `interests` attached (every option gets the field, [] when none). */
export function withInterests(
  options: BasketOption[],
  plan: KitPlan,
  candidatesByItem: Record<string, Candidate[]>,
  persona: Persona,
  vouchers: Voucher[],
  today: string,
): BasketOption[] {
  return options.map((o) => ({ ...o, interests: findInterests(plan, o, candidatesByItem, persona, vouchers, today) }));
}
