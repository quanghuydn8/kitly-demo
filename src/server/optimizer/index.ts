// Optimizer (PRD "Optimizer", seam S1): plan + scored candidates + shops + vouchers + profile → BasketOption.
// Pure and deterministic: no I/O, no LLM, no clock (today is passed in, default the DEMO_TODAY helper).
//
// 1. Items without candidates → noMatch (reason from the Matcher, else derived).
// 2. Must-haves are forced: if their cheapest basket exceeds the budget → status "over_budget" with minimumCost.
// 3. Nice-to-haves are dropped (lowest score-per-₫ first) until the cheapest basket fits; then re-added if they fit.
// 4. For the kept items (candidates above the shared quality floor), hill-climb the profile objective  Σscore − α·grandTotal/costUnit  under grandTotal ≤ budget,
//    pricing every state exactly (shipping per shop + vouchers), so consolidation is chosen whenever it pays.
// Invariant: status "ok" ⇒ grandTotal ≤ budget (every returned ok state was priced and checked against the cap).
import type { BasketOption, Candidate, KitPlan, PlanItem, Profile, Shop, Voucher } from "@/contract";
import { today as demoToday } from "@/server/today";
import { Pricer, type Pick as LinePick } from "./pricing";
import { buildGroups, buildLines, buildSavings, costDrivers } from "./present";
import { climb, evaluate, minCost, picksOf, type Objective, type Problem, type State } from "./search";

export type NoMatchReason = BasketOption["noMatch"][number]["reason"];

export interface OptimizerInput {
  plan: KitPlan;
  /** Scored candidates per plan item key (from the Matcher). Missing or empty = no candidate. */
  candidates: Record<string, Candidate[]>;
  /** Why an item has no candidate, from the Matcher. Default: no_category if category is null, else no_product_with_tags. */
  noMatchReasons?: Record<string, NoMatchReason>;
  shops: Shop[];
  vouchers: Voucher[];
  profile: Profile;
  /** YYYY-MM-DD used for voucher validity; defaults to DEMO_TODAY. */
  today?: string;
}

/**
 * Profile weights. α = how many score points one "average line price" of extra cost is worth giving up.
 * Profiles differ only in α, over the same candidate pool, so a larger α never buys a dearer basket
 * (saver ≤ balanced ≤ premium in grand total — T20a).
 */
export const PROFILE_WEIGHTS: Record<Profile, { alpha: number }> = {
  saver: { alpha: 50 },
  balanced: { alpha: 0.25 },
  premium: { alpha: 0.01 },
};

/**
 * Quality floor shared by every profile: only candidates scoring ≥ floor × the item's best score are picked.
 * Shared, not saver-only: a saver-only floor made the cheapest profile the pickiest and dearer than balanced.
 */
export const QUALITY_FLOOR = 0.7;

interface Usable {
  item: PlanItem;
  all: Candidate[]; // every candidate, best-first (for alternatives)
  pool: Candidate[]; // candidates this profile may choose
}

function sortBest(cs: Candidate[]): Candidate[] {
  return [...cs].sort(
    (a, b) =>
      b.score - a.score || a.product.price - b.product.price || a.product.id.localeCompare(b.product.id),
  );
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function optimize(input: OptimizerInput): BasketOption {
  const { plan, profile } = input;
  const { alpha } = PROFILE_WEIGHTS[profile];
  const pricer = new Pricer(input.shops, input.vouchers, input.today ?? demoToday());
  const cap = plan.budget ?? Infinity;

  const noMatch: BasketOption["noMatch"] = [];
  const usable: Usable[] = [];
  for (const item of plan.items) {
    const all = sortBest(input.candidates[item.key] ?? []);
    if (all.length === 0) {
      const reason =
        input.noMatchReasons?.[item.key] ?? (item.category === null ? "no_category" : "no_product_with_tags");
      noMatch.push({ itemKey: item.key, needLabel: item.needLabel, reason });
      continue;
    }
    const minScore = QUALITY_FLOOR * all[0].score;
    usable.push({ item, all, pool: all.filter((c) => c.score >= minScore) });
  }

  // Cost is measured in "average line prices" so α means the same for a 300k kit and a 30M kit.
  const costUnit = Math.max(
    1,
    usable.length === 0
      ? 1
      : usable.reduce((s, u) => s + median(u.all.map((c) => c.product.price * u.item.quantity)), 0) /
          usable.length,
  );
  const objective: Objective = (score, grand) => score - (alpha * grand) / costUnit;
  const problem = (list: Usable[]): Problem => ({
    items: list.map((u) => u.item),
    cands: list.map((u) => u.pool),
    pricer,
  });
  const minLine = (u: Usable) => Math.min(...u.pool.map((c) => c.product.price * u.item.quantity));

  // Must-haves alone over budget → honest over_budget with the cheapest must-have basket.
  const must = usable.filter((u) => u.item.required);
  const mustMin = minCost(problem(must));
  if (mustMin.priced.grandTotal > cap) {
    const picks = picksOf(problem(must), mustMin.sel);
    return assemble(
      input,
      noMatch,
      skippedOf(usable.filter((u) => !u.item.required)),
      usable,
      picks,
      mustMin,
      {
        status: "over_budget",
        minimumCost: mustMin.priced.grandTotal,
        costDrivers: costDrivers(picks),
      },
    );
  }

  // Choose which nice-to-haves fit (knapsack-style greedy on score per ₫, verified with exact pricing).
  const kept = new Set(usable.map((u) => u.item.key));
  const keptList = () => usable.filter((u) => kept.has(u.item.key));
  const fits = () => minCost(problem(keptList())).priced.grandTotal <= cap;
  const dropped: Usable[] = [];
  if (cap !== Infinity) {
    const dropOrder = usable
      .map((u, idx) => ({ u, idx, ratio: u.pool[0].score / Math.max(1, minLine(u)) }))
      .filter((x) => !x.u.item.required)
      .sort((a, b) => a.ratio - b.ratio || b.idx - a.idx);
    for (const { u } of dropOrder) {
      if (fits()) break;
      kept.delete(u.item.key);
      dropped.push(u);
    }
    for (const u of [...dropped].sort((a, b) => minLine(a) - minLine(b))) {
      kept.add(u.item.key);
      if (fits()) dropped.splice(dropped.indexOf(u), 1);
      else kept.delete(u.item.key);
    }
  }

  const list = keptList();
  const pb = problem(list);
  // Standalone pick per line = best for the profile ignoring shipping/vouchers (also explains consolidation).
  const standaloneSel = list.map((u) => {
    let bi = 0;
    u.pool.forEach((c, j) => {
      const v = (x: Candidate) => x.score - (alpha * x.product.price * u.item.quantity) / costUnit;
      if (v(c) > v(u.pool[bi]) + 1e-12) bi = j;
    });
    return bi;
  });

  const starts = [minCost(pb).sel];
  if (evaluate(pb, standaloneSel, objective).priced.grandTotal <= cap) starts.push(standaloneSel);
  let bestState: State | null = null;
  for (const s of starts) {
    const st = climb(pb, s, objective, cap);
    if (
      !bestState ||
      st.value > bestState.value + 1e-9 ||
      (Math.abs(st.value - bestState.value) <= 1e-9 && st.priced.grandTotal < bestState.priced.grandTotal)
    )
      bestState = st;
  }
  const final = bestState!;
  const picks = picksOf(pb, final.sel);

  const standalone = new Map(list.map((u, i) => [u.item.key, u.pool[standaloneSel[i]]]));
  return assemble(
    input,
    noMatch,
    skippedOf(dropped),
    usable,
    picks,
    final,
    { status: "ok" },
    standalone,
  );
}

function skippedOf(us: Usable[]): BasketOption["skipped"] {
  return us.map((u) => ({ itemKey: u.item.key, needLabel: u.item.needLabel, reason: "budget" as const }));
}

function assemble(
  input: OptimizerInput,
  noMatch: BasketOption["noMatch"],
  skipped: BasketOption["skipped"],
  usable: Usable[],
  picks: LinePick[],
  state: State,
  extra: Pick<BasketOption, "status" | "minimumCost" | "costDrivers">,
  standalone = new Map<string, Candidate>(),
): BasketOption {
  const p = state.priced;
  const order = new Map(input.plan.items.map((it, i) => [it.key, i]));
  skipped.sort((a, b) => order.get(a.itemKey)! - order.get(b.itemKey)!);
  return {
    profile: input.profile,
    status: extra.status,
    lines: buildLines(p, picks, new Map(usable.map((u) => [u.item.key, u.all])), standalone),
    noMatch,
    skipped,
    shops: buildGroups(p),
    itemsTotal: p.itemsTotal,
    shippingTotal: p.shippingTotal,
    discountTotal: p.discountTotal,
    grandTotal: p.grandTotal,
    savings: buildSavings(p),
    ...(extra.minimumCost !== undefined
      ? { minimumCost: extra.minimumCost, costDrivers: extra.costDrivers }
      : {}),
  };
}
