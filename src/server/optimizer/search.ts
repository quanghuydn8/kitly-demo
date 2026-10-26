// Local search over candidate choices. Every state is priced exactly by the Pricer (shipping + vouchers included),
// so consolidating into fewer shops and reaching voucher thresholds emerge from the objective, not from special cases.
// Moves: change one line's candidate; or move every line that can go to shop S onto S (best-scored / cheapest there).
import type { Candidate, PlanItem } from "@/contract";
import { type Pick, type Priced, type Pricer } from "./pricing";

export interface Problem {
  items: PlanItem[];
  /** Per item, candidates sorted best-first (score desc, price asc, id asc). */
  cands: Candidate[][];
  pricer: Pricer;
}

/** Higher is better. `score` = sum of chosen candidate scores, `grand` = grand total VND. */
export type Objective = (score: number, grand: number) => number;

export interface State {
  sel: number[];
  priced: Priced;
  score: number;
  value: number;
}

const EPS = 1e-9;
const MAX_ROUNDS = 200;

export function picksOf(pb: Problem, sel: number[]): Pick[] {
  return sel.map((j, i) => ({ item: pb.items[i], cand: pb.cands[i][j] }));
}

export function evaluate(pb: Problem, sel: number[], objective: Objective): State {
  const priced = pb.pricer.price(picksOf(pb, sel));
  let score = 0;
  for (let i = 0; i < sel.length; i++) score += pb.cands[i][sel[i]].score;
  return { sel, priced, score, value: objective(score, priced.grandTotal) };
}

function better(a: State, b: State): boolean {
  if (a.value > b.value + EPS) return true;
  if (a.value < b.value - EPS) return false;
  return a.priced.grandTotal < b.priced.grandTotal;
}

function shopMoves(pb: Problem, sel: number[]): number[][] {
  const shopIds = new Set<string>();
  for (const cs of pb.cands) for (const c of cs) shopIds.add(c.shop.id);
  const out: number[][] = [];
  for (const shopId of [...shopIds].sort()) {
    const bestScored = sel.slice();
    const cheapest = sel.slice();
    let changed = false;
    pb.cands.forEach((cs, i) => {
      let bi = -1;
      let ci = -1;
      cs.forEach((c, j) => {
        if (c.shop.id !== shopId) return;
        if (bi < 0) bi = j; // sorted best-first
        if (ci < 0 || c.product.price < cs[ci].product.price) ci = j;
      });
      if (bi >= 0) {
        bestScored[i] = bi;
        cheapest[i] = ci;
        changed = changed || bi !== sel[i] || ci !== sel[i];
      }
    });
    if (changed) out.push(bestScored, cheapest);
  }
  return out;
}

/** Steepest-ascent hill climb from `start`, never leaving `grandTotal ≤ cap`. `start` must be feasible. */
export function climb(pb: Problem, start: number[], objective: Objective, cap: number): State {
  let cur = evaluate(pb, start, objective);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let bestNext: State | null = null;
    const consider = (sel: number[]) => {
      const s = evaluate(pb, sel, objective);
      if (s.priced.grandTotal > cap) return;
      if (better(s, bestNext ?? cur)) bestNext = s;
    };
    for (let i = 0; i < cur.sel.length; i++) {
      for (let j = 0; j < pb.cands[i].length; j++) {
        if (j === cur.sel[i]) continue;
        const sel = cur.sel.slice();
        sel[i] = j;
        consider(sel);
      }
    }
    for (const sel of shopMoves(pb, cur.sel)) consider(sel);
    if (!bestNext) break;
    cur = bestNext;
  }
  return cur;
}

/** Cheapest basket for these items (heuristic minimum: cheapest-per-line start, then cost-only climb). */
export function minCost(pb: Problem): State {
  const start = pb.cands.map((cs) => {
    let ci = 0;
    cs.forEach((c, j) => {
      if (c.product.price < cs[ci].product.price) ci = j;
    });
    return ci;
  });
  return climb(pb, start, (score, grand) => -grand + score * 1e-6, Infinity);
}
