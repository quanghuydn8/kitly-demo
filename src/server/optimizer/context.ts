// Optimizer input + the derived context shared by optimize() and fitToBudget() / priceBasket().
import type { BasketOption, Candidate, KitPlan, Shop, Voucher } from "@/contract";
import { today as demoToday } from "@/server/today";
import { describePrice, Pricer, type PriceDetail } from "./pricing";

export interface OptimizerInput {
  plan: KitPlan;
  candidates: Record<string, Candidate[]>; // itemKey → scored candidates from the Matcher (score = quality only)
  noMatch?: BasketOption["noMatch"]; // items the Matcher could not cover, with reason + closest
  shops: Shop[];
  vouchers: Voucher[]; // public + the persona's wallet vouchers (adapter.listVouchers(persona))
  today?: string; // YYYY-MM-DD for voucher validity; default DEMO_TODAY
}

export interface Context {
  input: OptimizerInput;
  usable: Record<string, Candidate[]>; // in stock + arrive by the deadline
  searchPool: Record<string, Candidate[]>; // usable, capped for the search
  noMatch: BasketOption["noMatch"];
  pricer: Pricer;
}

// Search pool per item: top by quality ∪ cheapest (no quality floor, so saver and premium can differ).
const POOL_TOP = 6;
const POOL_CHEAP = 4;

export function usableCandidates(plan: KitPlan, list: Candidate[] = []): Candidate[] {
  return list.filter((c) => c.product.stock > 0 && (plan.deadline === null || c.arrivesBy <= plan.deadline));
}

function poolOf(list: Candidate[]): Candidate[] {
  if (list.length <= POOL_TOP + POOL_CHEAP) return list;
  const top = [...list].sort((a, b) => b.score - a.score || a.product.price - b.product.price).slice(0, POOL_TOP);
  const cheap = [...list]
    .filter((c) => !top.includes(c))
    .sort((a, b) => a.product.price - b.product.price || b.score - a.score)
    .slice(0, POOL_CHEAP);
  return list.filter((c) => top.includes(c) || cheap.includes(c));
}

export function buildContext(input: OptimizerInput): Context {
  const { plan } = input;
  const usable: Record<string, Candidate[]> = {};
  const searchPool: Record<string, Candidate[]> = {};
  for (const it of plan.items) {
    usable[it.key] = usableCandidates(plan, input.candidates[it.key]);
    searchPool[it.key] = poolOf(usable[it.key]);
  }
  const given = new Map((input.noMatch ?? []).map((n) => [n.itemKey, n]));
  const noMatch: BasketOption["noMatch"] = [];
  for (const it of plan.items) {
    if (usable[it.key].length) continue;
    noMatch.push(
      given.get(it.key) ?? {
        itemKey: it.key,
        needLabel: it.needLabel,
        reason: it.category === null ? "no_category" : "none_in_time",
        closest: null,
      },
    );
  }
  const all = Object.values(input.candidates).flat();
  const pricer = new Pricer(input.shops, all, input.vouchers, input.today ?? demoToday());
  return { input, usable, searchPool, noMatch, pricer };
}

export interface BasketPrice extends Pick<
  BasketOption,
  "shops" | "itemsTotal" | "shippingTotal" | "discountTotal" | "grandTotal" | "savings"
> {
  detail: PriceDetail;
}

/** Exact price of a basket = itemKey → chosen candidate (quantity from the plan item). Shared with priceSelection (T09). */
export function priceBasket(input: OptimizerInput, picks: Record<string, Candidate>, pricer?: Pricer): BasketPrice {
  const pr = pricer ?? new Pricer(input.shops, Object.values(picks), input.vouchers, input.today ?? demoToday());
  const sub = new Float64Array(pr.shops.length);
  for (const [key, c] of Object.entries(picks)) {
    const qty = input.plan.items.find((it) => it.key === key)?.quantity ?? 1;
    const idx = pr.shopIndex.get(c.shop.id);
    if (idx === undefined) throw new Error(`priceBasket: unknown shop ${c.shop.id}`);
    sub[idx] += c.product.price * qty;
  }
  const detail = pr.price(sub);
  const { shops, savings } = describePrice(detail, input.plan.language);
  const { itemsTotal, shippingTotal, discountTotal, grandTotal } = detail;
  return { shops, savings, itemsTotal, shippingTotal, discountTotal, grandTotal, detail };
}
