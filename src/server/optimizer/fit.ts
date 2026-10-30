// "Fit to budget" (D29, CONTRACT FitSuggestion): code-computed ways back under budget for an over-budget basket.
// Moves, in this order: (1) drop items the buyer added with "Add anyway", (2) drop nice-to-haves (lowest score per ₫
// first), (3) swap lines to their cheapest candidate, (4) drop must-haves only if nothing else fits.
// Each prefix is re-priced exactly; a fitting path is pruned (undo moves that are not needed). At most 2 suggestions.
// Shared by the Optimizer's over_budget path and ticket 09's priceSelection.
import type { Candidate, FitSuggestion, PlanItem } from "@/contract";
import { fitLabel } from "./labels";
import { Pricer } from "./pricing";
import { priceBasket, usableCandidates, type OptimizerInput } from "./context";
import { today as demoToday } from "@/server/today";

export interface FitBasket {
  picks: Record<string, Candidate>; // itemKey → product in the basket now
  addedAnyway?: string[]; // itemKeys whose pick is a closest product added with "Add anyway"
}

type Move = { kind: "drop"; key: string; must: boolean } | { kind: "swap"; key: string; to: Candidate };

const perVnd = (c: Candidate, qty: number) => c.score / Math.max(1, c.product.price * qty);

export function fitToBudget(input: OptimizerInput, basket: FitBasket): FitSuggestion[] {
  const budget = input.plan.budget;
  if (budget === null) return [];
  const items = new Map<string, PlanItem>(input.plan.items.map((it) => [it.key, it]));
  const qty = (key: string) => items.get(key)?.quantity ?? 1;
  const pool = Object.values(input.candidates).flat();
  const pricer = new Pricer(
    input.shops,
    [...pool, ...Object.values(basket.picks)],
    input.vouchers,
    input.today ?? demoToday(),
  );
  const keys = Object.keys(basket.picks);
  const anyway = new Set(basket.addedAnyway ?? []);

  const apply = (moves: Move[]) => {
    const picks = { ...basket.picks };
    for (const m of moves) {
      if (m.kind === "drop") delete picks[m.key];
      else if (m.key in picks) picks[m.key] = m.to;
    }
    return picks;
  };
  const total = (moves: Move[]) => priceBasket(input, apply(moves), pricer).grandTotal;
  if (total([]) <= budget) return [];

  const order = (ks: string[]) =>
    [...ks].sort(
      (a, b) => perVnd(basket.picks[a], qty(a)) - perVnd(basket.picks[b], qty(b)) || keys.indexOf(b) - keys.indexOf(a),
    );
  const drops1 = order(keys.filter((k) => anyway.has(k))).map((key): Move => ({ kind: "drop", key, must: false }));
  const drops2 = order(keys.filter((k) => !anyway.has(k) && items.get(k)?.required === false)).map((key): Move => ({
    kind: "drop",
    key,
    must: false,
  }));
  const swaps: Move[] = keys
    .filter((k) => !anyway.has(k))
    .map((key) => {
      const now = basket.picks[key];
      const cheapest = usableCandidates(input.plan, input.candidates[key])
        .filter((c) => c.product.price < now.product.price)
        .sort((a, b) => a.product.price - b.product.price || b.score - a.score)[0];
      return cheapest ? { key, to: cheapest, saving: (now.product.price - cheapest.product.price) * qty(key) } : null;
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.saving - a.saving)
    .map(({ key, to }): Move => ({ kind: "swap", key, to }));

  /** Apply `moves` one by one on top of `base` until the basket fits; returns the applied list. */
  const walk = (base: Move[], moves: Move[]) => {
    const applied = [...base];
    for (const m of moves) {
      if (total(applied) <= budget) break;
      applied.push(m);
    }
    return applied;
  };
  /** Undo moves that are not needed to fit (latest first). */
  const prune = (moves: Move[]) => {
    let kept = [...moves];
    for (let i = kept.length - 1; i >= 0; i--) {
      const without = kept.filter((_, j) => j !== i);
      if (total(without) <= budget) kept = without;
    }
    return kept;
  };
  const mustDrops = (applied: Move[]) => {
    const picks = apply(applied);
    return [...Object.keys(picks)]
      .filter((k) => !anyway.has(k) && items.get(k)?.required !== false)
      .sort((a, b) => perVnd(picks[a], qty(a)) - perVnd(picks[b], qty(b)) || keys.indexOf(b) - keys.indexOf(a))
      .map((key): Move => ({ kind: "drop", key, must: true }));
  };

  const paths: Move[][] = [];
  const soft = walk([], [...drops1, ...drops2, ...swaps]);
  if (total(soft) <= budget) {
    paths.push(prune(soft));
    const swapOnly = walk([], swaps);
    if (total(swapOnly) <= budget) paths.push(prune(swapOnly));
  } else {
    if (soft.length) paths.push(soft); // best effort without dropping a must-have (fits: false)
    paths.push(prune(walk(soft, mustDrops(soft))));
  }

  const seen = new Set<string>();
  const out: FitSuggestion[] = [];
  for (const moves of paths) {
    const s = toSuggestion(moves, out.length + 1);
    const sig = JSON.stringify([s.removeItemKeys, s.swaps]);
    if (seen.has(sig) || (!s.removeItemKeys.length && !s.swaps.length) || out.length === 2) continue;
    seen.add(sig);
    out.push(s);
  }
  return out;

  function toSuggestion(moves: Move[], n: number): FitSuggestion {
    const removed = moves.filter((m) => m.kind === "drop").map((m) => m.key);
    const swapped = moves.filter(
      (m): m is Extract<Move, { kind: "swap" }> => m.kind === "swap" && !removed.includes(m.key),
    );
    const grandTotal = total(moves);
    const label = (k: string) => items.get(k)?.needLabel ?? k;
    return {
      id: `fit-${n}`,
      label: fitLabel(
        removed.map(label),
        swapped.map((m) => ({ needLabel: label(m.key), title: m.to.product.title })),
        grandTotal,
        input.plan.language,
      ),
      removeItemKeys: removed,
      swaps: swapped.map((m) => ({ itemKey: m.key, productId: m.to.product.id })),
      grandTotal,
      fits: grandTotal <= budget!,
      dropsMustHave: moves.some((m) => m.kind === "drop" && m.must),
    };
  }
}
