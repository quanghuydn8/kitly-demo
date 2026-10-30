// Basket Optimizer (PRD "Optimizer", seam S1): plan + scored candidates + shops + vouchers → BasketOption per profile.
// Pure, deterministic, no I/O, no LLM. Steps:
//   1. usable candidates (in stock, arrive by the deadline); items without any → noMatch (reason from the Matcher).
//   2. item set, the SAME for every profile: must-haves forced; nice-to-haves dropped lowest score-per-₫ first until the
//      cheapest basket fits. Must-haves alone over budget ⇒ status "over_budget" (cheapest basket + fit suggestions).
//   3. per profile one candidate per item (search.ts), priced exactly (pricing.ts).
import type { BasketLine, BasketOption, Candidate, PlanItem, Profile } from "@/contract";
import { lineReason, type Lang, type ReasonKind } from "./labels";
import { describePrice } from "./pricing";
import { minCost, Problem, solve, type Slot, type Sol } from "./search";
import { fitToBudget } from "./fit";
import { buildContext, type Context, type OptimizerInput } from "./context";

const PROFILES: Profile[] = ["saver", "balanced", "premium"];

/** Best value of an item = max over its candidates of score per ₫ of the line. */
function valuePerVnd(it: PlanItem, cands: Candidate[]): number {
  return Math.max(...cands.map((c) => c.score / Math.max(1, c.product.price * it.quantity)));
}

function problemFor(ctx: Context, items: PlanItem[]): Problem {
  const slots: Slot[] = items.map((it) => ({ key: it.key, qty: it.quantity, cands: ctx.searchPool[it.key] }));
  return new Problem(slots, ctx.pricer);
}

function alternativesFor(ctx: Context, key: string, chosen: Candidate): Candidate[] {
  const seen = new Set([chosen.shop.id]);
  const out: Candidate[] = [];
  const sorted = [...ctx.usable[key]].sort((a, b) => b.score - a.score || a.product.price - b.product.price);
  for (const c of sorted) {
    if (out.length === 2) break;
    if (seen.has(c.shop.id)) continue;
    seen.add(c.shop.id);
    out.push(c);
  }
  return out;
}

/** Why this candidate (code template). "consolidated" when the per-line pick would differ but the shop ships others too. */
function reasonFor(p: Problem, i: number, j: number, sol: Sol, profile: Profile, lambda: number, lang: Lang): string {
  const own = (jj: number) =>
    profile === "saver"
      ? p.lineTotal(i, jj) - p.score(i, jj) * 1e-3
      : profile === "premium"
        ? -p.score(i, jj) + p.lineTotal(i, jj) * 1e-12
        : -(p.score(i, jj) - lambda * p.lineTotal(i, jj));
  const standalone = p.pickBy((ii, jj) => (ii === i ? own(jj) : 0))[i];
  const c = p.slots[i].cands[j];
  const others = sol.state.filter((jj, ii) => ii !== i && p.slots[ii].cands[jj].shop.id === c.shop.id).length;
  const kind: ReasonKind =
    standalone === j || own(standalone) === own(j) ? profile : others > 0 ? "consolidated" : "vouchers";
  return lineReason(kind, lang, { arrivesBy: c.arrivesBy, rating: c.product.rating, shopName: c.shop.name, others });
}

function buildOption(
  ctx: Context,
  p: Problem,
  sol: Sol,
  profile: Profile,
  lambda: number,
  skipped: PlanItem[],
): BasketOption {
  const lang = ctx.input.plan.language;
  const lines: BasketLine[] = p.slots.map((s, i) => {
    const c = s.cands[sol.state[i]];
    return {
      itemKey: s.key,
      product: c.product,
      shop: c.shop,
      quantity: s.qty,
      lineTotal: c.product.price * s.qty,
      reason: reasonFor(p, i, sol.state[i], sol, profile, lambda, lang),
      alternatives: alternativesFor(ctx, s.key, c),
    };
  });
  const detail = ctx.pricer.price(p.subtotals(sol.state));
  const { shops, savings } = describePrice(detail, lang);
  return {
    profile,
    status: "ok",
    lines,
    noMatch: ctx.noMatch,
    skipped: skipped.map((it) => ({ itemKey: it.key, needLabel: it.needLabel, reason: "budget" as const })),
    shops,
    itemsTotal: detail.itemsTotal,
    shippingTotal: detail.shippingTotal,
    discountTotal: detail.discountTotal,
    grandTotal: detail.grandTotal,
    savings,
  };
}

function overBudget(ctx: Context, must: PlanItem[], nice: PlanItem[], profiles: Profile[]): BasketOption[] {
  const budget = ctx.input.plan.budget!;
  const p = problemFor(ctx, must);
  const cheapest = minCost(p);
  const base = buildOption(ctx, p, cheapest, "saver", 0, nice);
  const picks = Object.fromEntries(base.lines.map((l, i) => [l.itemKey, p.slots[i].cands[cheapest.state[i]]]));
  const costDrivers = [...base.lines]
    .map((l, idx) => ({ l, idx }))
    .sort((a, b) => b.l.lineTotal - a.l.lineTotal || a.idx - b.idx)
    .slice(0, 3)
    .map(({ l }) => must.find((it) => it.key === l.itemKey)!.needLabel);
  const extra = {
    status: "over_budget" as const,
    minimumCost: base.grandTotal,
    costDrivers,
    overBy: base.grandTotal - budget,
    fit: fitToBudget(ctx.input, { picks }),
  };
  // every profile shows the cheapest possible basket: even that is over budget
  return profiles.map((profile) => ({ ...base, ...extra, profile }));
}

/** One BasketOption per requested profile (default saver, balanced, premium), in the requested order. */
export function optimize(input: OptimizerInput, profiles: Profile[] = PROFILES): BasketOption[] {
  const ctx = buildContext(input);
  const budget = input.plan.budget;
  const covered = input.plan.items.filter((it) => ctx.usable[it.key]?.length);
  const must = covered.filter((it) => it.required);
  let nice = covered.filter((it) => !it.required);
  const skipped: PlanItem[] = [];

  if (budget !== null) {
    if (minCost(problemFor(ctx, must)).cost > budget) return overBudget(ctx, must, nice, profiles);
    const dropOrder = [...nice].sort(
      (a, b) =>
        valuePerVnd(a, ctx.usable[a.key]) - valuePerVnd(b, ctx.usable[b.key]) ||
        covered.indexOf(b) - covered.indexOf(a),
    );
    const inSet = (items: PlanItem[]) => covered.filter((it) => it.required || items.includes(it));
    while (nice.length && minCost(problemFor(ctx, inSet(nice))).cost > budget) {
      const drop = dropOrder.shift()!;
      skipped.push(drop);
      nice = nice.filter((it) => it !== drop);
    }
    skipped.sort((a, b) => covered.indexOf(a) - covered.indexOf(b));
  }

  const p = problemFor(
    ctx,
    covered.filter((it) => it.required || nice.includes(it)),
  );
  const s = solve(p, budget);
  return profiles.map((profile) => buildOption(ctx, p, s[profile], profile, s.lambda, skipped));
}

export const optimizeProfile = (input: OptimizerInput, profile: Profile): BasketOption => optimize(input, [profile])[0];
