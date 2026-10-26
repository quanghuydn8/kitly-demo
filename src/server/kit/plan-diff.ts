// Plan diff by item key (CONTRACT.md PlanDiff) + key repair for refine. Pure, no I/O.
import type { KitPlan, PlanDiff, PlanItem } from "@/contract";

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set([...a, ...b]).size === new Set(a).size;

function itemChanged(a: PlanItem, b: PlanItem): boolean {
  return (
    a.needLabel !== b.needLabel ||
    a.category !== b.category ||
    a.required !== b.required ||
    a.quantity !== b.quantity ||
    a.maxUnitPrice !== b.maxUnitPrice ||
    !sameSet(a.mustHaveTags, b.mustHaveTags) ||
    !sameSet(a.niceToHaveTags, b.niceToHaveTags)
  );
}

/** Item-level diff by key: added/changed in the new plan's order, removed in the previous plan's order. */
export function diffPlans(prev: KitPlan, next: KitPlan): PlanDiff {
  const before = new Map(prev.items.map((i) => [i.key, i]));
  const after = new Set(next.items.map((i) => i.key));
  return {
    added: next.items.filter((i) => !before.has(i.key)).map((i) => i.key),
    removed: prev.items.filter((i) => !after.has(i.key)).map((i) => i.key),
    changed: next.items.filter((i) => before.has(i.key) && itemChanged(before.get(i.key)!, i)).map((i) => i.key),
  };
}

/**
 * Gives a new-keyed item back the key of a previous item that vanished from the plan and is clearly the same need:
 * same category (one item per category), or the same needLabel when the category is null.
 */
export function keepPlanKeys(prev: KitPlan, next: KitPlan): KitPlan {
  const used = new Set(next.items.map((i) => i.key));
  const prevKeys = new Set(prev.items.map((i) => i.key));
  const free = prev.items.filter((i) => !used.has(i.key));
  const items = next.items.map((item) => {
    if (prevKeys.has(item.key)) return item;
    const idx = free.findIndex((p) =>
      item.category !== null ? p.category === item.category : p.category === null && p.needLabel === item.needLabel,
    );
    if (idx < 0) return item;
    const [match] = free.splice(idx, 1);
    return { ...item, key: match.key };
  });
  return { ...next, items };
}
