// PlanDiff (CONTRACT §1): computed in CODE by item key between two plans — added / removed / changed (same key, any
// field different; tag lists compared as sets).
import type { KitPlan, PlanDiff, PlanItem } from "@/contract";

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

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

export function diffPlans(prev: KitPlan, next: KitPlan): PlanDiff {
  const before = new Map(prev.items.map((i) => [i.key, i]));
  const after = new Set(next.items.map((i) => i.key));
  return {
    added: next.items.filter((i) => !before.has(i.key)).map((i) => i.key),
    removed: prev.items.filter((i) => !after.has(i.key)).map((i) => i.key),
    changed: next.items.filter((i) => before.has(i.key) && itemChanged(before.get(i.key)!, i)).map((i) => i.key),
  };
}
