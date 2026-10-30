// priceSelection (PRD "Optimizer", seam S9, CONTRACT KitSelection): the buyer's edits on top of ONE profile's option.
// Pure code, no I/O, no LLM. Base basket = the Optimizer's option for `selection.profile` (deterministic, so the same
// stored plan always gives the same base); then `picks` (itemKey → productId: a swap to any exact candidate of that
// item, or "Add anyway" of the item's closest product, D28) and `dropped` (itemKeys removed by Fit to budget; wins over
// a pick). Priced with the Optimizer's exact pricer; over budget ⇒ status over_budget + overBy + fit (fitToBudget).
import type { BasketLine, BasketOption, Candidate, KitPlan, KitSelection, PlanItem, Shop, Voucher } from "@/contract";
import { fitToBudget, optimize, priceBasket, type OptimizerInput } from "@/server/optimizer";
import { lineReason, type Lang } from "@/server/optimizer/labels";
import { today as demoToday } from "@/server/today";

/** A pick the server cannot honour (unknown item, or a product that is neither a candidate nor the closest). */
export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectionError";
  }
}

export interface PriceSelectionOptions {
  noMatch?: BasketOption["noMatch"]; // from the Matcher: carries the closest product for "Add anyway"
  today?: string;
}

const byScore = (a: Candidate, b: Candidate) => b.score - a.score || a.product.price - b.product.price;

function alternatives(list: Candidate[], chosen: Candidate): Candidate[] {
  const seen = new Set([chosen.shop.id]);
  const out: Candidate[] = [];
  for (const c of [...list].sort(byScore)) {
    if (out.length === 2) break;
    if (seen.has(c.shop.id)) continue;
    seen.add(c.shop.id);
    out.push(c);
  }
  return out;
}

function pickReason(lang: Lang, c: Candidate, anyway: boolean, missingTags: string[]): string {
  if (anyway) {
    const missing = missingTags.join(", ");
    if (lang === "vi") return missing ? `Bạn vẫn thêm dù thiếu: ${missing}` : "Bạn vẫn thêm sản phẩm gần nhất";
    return missing ? `Added anyway, missing: ${missing}` : "Added anyway (closest product)";
  }
  const base = lineReason("premium", lang, { arrivesBy: c.arrivesBy, rating: c.product.rating, shopName: c.shop.name, others: 0 });
  return lang === "vi" ? `Bạn chọn · ${base}` : `Your pick · ${base}`;
}

export function priceSelection(
  plan: KitPlan,
  candidatesByItem: Record<string, Candidate[]>,
  selection: KitSelection,
  shops: Shop[],
  vouchers: Voucher[],
  opts: PriceSelectionOptions = {},
): BasketOption {
  const today = opts.today ?? demoToday();
  const input: OptimizerInput = { plan, candidates: candidatesByItem, noMatch: opts.noMatch, shops, vouchers, today };
  const base = optimize(input, [selection.profile])[0];
  const items = new Map<string, PlanItem>(plan.items.map((it) => [it.key, it]));
  const closestOf = new Map((base.noMatch ?? []).flatMap((n) => (n.closest ? [[n.itemKey, n.closest] as const] : [])));

  // 1. base basket of this profile
  const chosen = new Map<string, Candidate>();
  const reasons = new Map<string, string>();
  for (const l of base.lines) {
    const c = (candidatesByItem[l.itemKey] ?? []).find((x) => x.product.id === l.product.id);
    if (!c) throw new Error(`priceSelection: base line ${l.itemKey} has no candidate`);
    chosen.set(l.itemKey, c);
    reasons.set(l.itemKey, l.reason);
  }

  // 2. picks: swaps (any exact candidate, incl. alternatives) or "Add anyway" (the closest product)
  const anyway = new Set<string>();
  for (const [key, productId] of Object.entries(selection.picks)) {
    if (!items.has(key)) throw new SelectionError(`Unknown item ${key}`);
    if (chosen.get(key)?.product.id === productId) continue;
    const cand = (candidatesByItem[key] ?? []).find((c) => c.product.id === productId);
    const closest = closestOf.get(key);
    if (cand) {
      chosen.set(key, cand);
      reasons.set(key, pickReason(plan.language, cand, false, []));
    } else if (closest && closest.candidate.product.id === productId) {
      chosen.set(key, closest.candidate);
      anyway.add(key);
      reasons.set(key, pickReason(plan.language, closest.candidate, true, closest.missingTags));
    } else {
      throw new SelectionError(`Product ${productId} is not an option for ${key}`);
    }
  }

  // 3. drops (Fit to budget) win over picks
  for (const key of selection.dropped) {
    chosen.delete(key);
    anyway.delete(key);
  }

  // 4. exact price, lines in plan order
  const keys = plan.items.map((it) => it.key).filter((k) => chosen.has(k));
  const picks = Object.fromEntries(keys.map((k) => [k, chosen.get(k)!]));
  const price = priceBasket(input, picks);
  const lines: BasketLine[] = keys.map((key) => {
    const c = picks[key];
    const qty = items.get(key)!.quantity;
    return {
      itemKey: key,
      product: c.product,
      shop: c.shop,
      quantity: qty,
      lineTotal: c.product.price * qty,
      reason: reasons.get(key)!,
      alternatives: anyway.has(key) ? [] : alternatives(candidatesByItem[key] ?? [], c),
    };
  });
  const inBasket = new Set(keys);
  const noMatch = base.noMatch.filter((n) => !inBasket.has(n.itemKey));
  const skipped: BasketOption["skipped"] = plan.items
    .filter(
      (it) =>
        !inBasket.has(it.key) &&
        (selection.dropped.includes(it.key) || base.skipped.some((s) => s.itemKey === it.key)),
    )
    .map((it) => ({ itemKey: it.key, needLabel: it.needLabel, reason: "budget" as const }));

  const option: BasketOption = {
    profile: selection.profile,
    status: "ok",
    lines,
    noMatch,
    skipped,
    shops: price.shops,
    itemsTotal: price.itemsTotal,
    shippingTotal: price.shippingTotal,
    discountTotal: price.discountTotal,
    grandTotal: price.grandTotal,
    savings: price.savings,
  };
  const budget = plan.budget;
  if (budget === null || price.grandTotal <= budget) return option;

  // over budget: cheapest basket of the same item set (Add-anyway products fixed), top-3 cost drivers, fit
  const fixed = Object.fromEntries(keys.map((k) => [k, anyway.has(k) ? [picks[k]] : (candidatesByItem[k] ?? [])]));
  const cheapest = optimize(
    { ...input, plan: { ...plan, budget: null, items: keys.map((k) => items.get(k)!) }, candidates: fixed, noMatch: [] },
    ["saver"],
  )[0];
  const costDrivers = [...lines]
    .map((l, idx) => ({ l, idx }))
    .sort((a, b) => b.l.lineTotal - a.l.lineTotal || a.idx - b.idx)
    .slice(0, 3)
    .map(({ l }) => items.get(l.itemKey)!.needLabel);
  return {
    ...option,
    status: "over_budget",
    minimumCost: Math.min(cheapest.grandTotal, price.grandTotal),
    costDrivers,
    overBy: price.grandTotal - budget,
    fit: fitToBudget(input, { picks, addedAnyway: [...anyway] }),
  };
}
