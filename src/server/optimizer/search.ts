// Profile search over one fixed item set (CONTRACT §1 "Profiles", D34). Every state is priced exactly by the Pricer,
// so consolidation into fewer shops wins whenever it pays. Small baskets (≤ EXHAUSTIVE_LIMIT states, e.g. the hero kit)
// are enumerated → exact optimum; larger ones use deterministic local search (single swaps + "move to shop" moves)
// from several starts. All three profiles are then picked from ONE pool of solutions, which makes the invariants hold
// by construction: saver.cost ≤ balanced.cost ≤ premium.cost and premium.score ≥ saver.score.
import type { Candidate } from "@/contract";
import type { Pricer } from "./pricing";

export const EXHAUSTIVE_LIMIT = 20_000;
const EPS = 1e-9;

export interface Slot {
  key: string;
  qty: number;
  cands: Candidate[];
}

export interface Sol {
  state: number[]; // candidate index per slot
  cost: number; // exact grandTotal
  score: number; // Σ candidate score (quality only)
}

export interface Solution {
  saver: Sol;
  balanced: Sol;
  premium: Sol;
  lambda: number; // balanced objective = score − lambda·cost
}

export class Problem {
  private line: number[][];
  private shop: number[][];
  private sc: number[][];
  private sub: Float64Array;
  readonly size: number; // number of states

  constructor(
    readonly slots: Slot[],
    readonly pricer: Pricer,
  ) {
    this.line = slots.map((s) => s.cands.map((c) => c.product.price * s.qty));
    this.shop = slots.map((s) => s.cands.map((c) => pricer.shopIndex.get(c.shop.id)!));
    this.sc = slots.map((s) => s.cands.map((c) => c.score));
    this.sub = new Float64Array(pricer.shops.length);
    this.size = slots.reduce((n, s) => n * s.cands.length, 1);
  }

  subtotals(state: number[]): Float64Array {
    this.sub.fill(0);
    for (let i = 0; i < state.length; i++) this.sub[this.shop[i][state[i]]] += this.line[i][state[i]];
    return this.sub;
  }

  sol(state: number[]): Sol {
    let score = 0;
    for (let i = 0; i < state.length; i++) score += this.sc[i][state[i]];
    return { state, cost: this.pricer.price(this.subtotals(state)).grandTotal, score };
  }

  /** Per slot: index of the candidate that is best by `key` (lower is better), optionally only at shop `k`. */
  pickBy(key: (i: number, j: number) => number, k?: number): number[] {
    return this.slots.map((s, i) => {
      let bestJ = -1;
      for (let j = 0; j < s.cands.length; j++) {
        if (k !== undefined && this.shop[i][j] !== k) continue;
        if (bestJ < 0 || key(i, j) < key(i, bestJ)) bestJ = j;
      }
      return bestJ;
    });
  }

  lineTotal = (i: number, j: number) => this.line[i][j];
  score = (i: number, j: number) => this.sc[i][j];
}

type Better = (a: Sol, b: Sol) => boolean;

const feasible = (s: Sol, budget: number | null) => budget === null || s.cost <= budget;

export const saverBetter: Better = (a, b) => a.cost < b.cost || (a.cost === b.cost && a.score > b.score + EPS);

function withBudget(budget: number | null, feasibleBetter: Better): Better {
  return (a, b) => {
    const fa = feasible(a, budget);
    const fb = feasible(b, budget);
    if (fa !== fb) return fa;
    if (!fa) return a.cost < b.cost; // walk towards the budget
    return feasibleBetter(a, b);
  };
}

const premiumBetter = (budget: number | null) =>
  withBudget(budget, (a, b) => a.score > b.score + EPS || (Math.abs(a.score - b.score) <= EPS && a.cost < b.cost));

const balancedBetter = (budget: number | null, lambda: number) =>
  withBudget(budget, (a, b) => {
    const oa = a.score - lambda * a.cost;
    const ob = b.score - lambda * b.cost;
    return oa > ob + EPS || (Math.abs(oa - ob) <= EPS && saverBetter(a, b));
  });

/** α = 1 on a cost unit that makes the saver and premium extremes score the same, so any better trade-off wins. */
function lambdaOf(saver: Sol, premium: Sol): number {
  if (premium.score - saver.score <= EPS) return 1; // nothing to buy with money: balanced = cheapest
  if (premium.cost <= saver.cost) return 0; // premium is also the cheapest
  return (premium.score - saver.score) / (premium.cost - saver.cost);
}

// ---------------- exhaustive ----------------
function* allStates(p: Problem): Generator<Sol> {
  const n = p.slots.length;
  const state = new Array<number>(n).fill(0);
  while (true) {
    yield p.sol([...state]);
    let i = n - 1;
    while (i >= 0 && ++state[i] === p.slots[i].cands.length) state[i--] = 0;
    if (i < 0) return;
  }
}

function pickFrom(sols: () => Iterable<Sol>, budget: number | null): Solution {
  let saver: Sol | null = null;
  let premium: Sol | null = null;
  const pb = premiumBetter(budget);
  for (const s of sols()) {
    if (!saver || saverBetter(s, saver)) saver = s;
    if (!premium || pb(s, premium)) premium = s;
  }
  // feasibility: premium falls back to the saver basket when nothing fits (callers only solve fitting item sets)
  if (!feasible(premium!, budget)) premium = saver;
  const lambda = lambdaOf(saver!, premium!);
  const bb = balancedBetter(budget, lambda);
  let balanced = saver!;
  for (const s of sols()) if (bb(s, balanced)) balanced = s;
  return { saver: saver!, balanced, premium: premium!, lambda };
}

// ---------------- local search ----------------
function neighbours(p: Problem, s: Sol, extra: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < s.state.length; i++) {
    for (let j = 0; j < p.slots[i].cands.length; j++) {
      if (j === s.state[i]) continue;
      const n = [...s.state];
      n[i] = j;
      out.push(n);
    }
  }
  for (const target of extra) {
    const n = s.state.map((j, i) => (target[i] >= 0 ? target[i] : j));
    if (n.some((j, i) => j !== s.state[i])) out.push(n);
  }
  return out;
}

function climb(p: Problem, start: Sol, better: Better, moves: number[][]): Sol {
  let cur = start;
  for (let iter = 0; iter < 500; iter++) {
    let next = cur;
    for (const n of neighbours(p, cur, moves)) {
      const sol = p.sol(n);
      if (better(sol, next)) next = sol;
    }
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

/** Ratio greedy: from an over-budget state, take the swap that loses the least score per ₫ saved until it fits. */
function repair(p: Problem, start: Sol, budget: number | null): Sol {
  let cur = start;
  while (!feasible(cur, budget)) {
    let next: Sol | null = null;
    let bestRatio = Infinity;
    for (const n of neighbours(p, cur, [])) {
      const sol = p.sol(n);
      if (sol.cost >= cur.cost) continue;
      const ratio = (cur.score - sol.score) / (cur.cost - sol.cost);
      if (ratio < bestRatio) [next, bestRatio] = [sol, ratio];
    }
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

/** Ratio greedy: while it stays within budget, take the upgrade that buys the most score per extra ₫. */
function upgrade(p: Problem, start: Sol, budget: number | null): Sol {
  let cur = start;
  for (let iter = 0; iter < 500; iter++) {
    let next: Sol | null = null;
    let bestRatio = -Infinity;
    for (const n of neighbours(p, cur, [])) {
      const sol = p.sol(n);
      if (!feasible(sol, budget) || sol.score <= cur.score + EPS) continue;
      const ratio = (sol.score - cur.score) / Math.max(sol.cost - cur.cost, 1);
      if (ratio > bestRatio) [next, bestRatio] = [sol, ratio];
    }
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

function heuristic(p: Problem, budget: number | null): Solution {
  const cheapest = (i: number, j: number) => p.lineTotal(i, j) - p.score(i, j) * 1e-3;
  const top = (i: number, j: number) => -p.score(i, j) + p.lineTotal(i, j) * 1e-12;
  // "move everything you can to shop k" targets, cheapest and best variants
  const moves: number[][] = [];
  for (let k = 0; k < p.pricer.shops.length; k++) {
    const a = p.pickBy(cheapest, k);
    if (a.every((j) => j < 0)) continue;
    moves.push(a, p.pickBy(top, k));
  }
  const fill = (target: number[], base: number[]) => target.map((j, i) => (j >= 0 ? j : base[i]));
  const cheap = p.pickBy(cheapest);
  const best = p.pickBy(top);
  const starts = [cheap, best, ...moves.map((m, idx) => fill(m, idx % 2 ? best : cheap))].map((s) => p.sol(s));

  const pool = new Map<string, Sol>();
  const add = (s: Sol) => pool.set(s.state.join(","), s);
  starts.forEach(add);

  for (const s of starts) add(climb(p, s, saverBetter, moves));
  const pb = premiumBetter(budget);
  for (const s of starts) add(climb(p, upgrade(p, repair(p, s, budget), budget), pb, moves));
  const first = pickFrom(() => pool.values(), budget);
  add(climb(p, upgrade(p, first.saver, budget), pb, moves));

  const mid = pickFrom(() => pool.values(), budget);
  const bb = balancedBetter(budget, mid.lambda);
  for (const s of [mid.saver, mid.premium, mid.balanced]) add(climb(p, s, bb, moves));
  return pickFrom(() => pool.values(), budget);
}

export function solve(p: Problem, budget: number | null): Solution {
  return p.size <= EXHAUSTIVE_LIMIT ? pickFrom(() => allStates(p), budget) : heuristic(p, budget);
}

/** Cheapest basket for the item set (saver only). */
export function minCost(p: Problem): Sol {
  if (p.size <= EXHAUSTIVE_LIMIT) {
    let best: Sol | null = null;
    for (const s of allStates(p)) if (!best || saverBetter(s, best)) best = s;
    return best!;
  }
  return heuristic(p, null).saver;
}
