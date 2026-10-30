// Planner outputs the FakeLLM returns in kit tests. `sloppyHeroPlan` breaks every code-enforced rule on purpose.
export const HERO = "My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.";

type Item = {
  key: string;
  needLabel: string;
  category: string | null;
  required: boolean;
  quantity: number;
  mustHaveTags: string[];
  niceToHaveTags: string[];
  maxUnitPrice: number | null;
};
const it = (key: string, category: string | null, over: Partial<Item> = {}): Item => ({
  key,
  needLabel: key[0].toUpperCase() + key.slice(1).replace(/-/g, " "),
  category,
  required: true,
  quantity: 1,
  mustHaveTags: [],
  niceToHaveTags: [],
  maxUnitPrice: null,
  ...over,
});

export function sloppyHeroPlan(over: { deadline?: string | null; budget?: number | null } = {}) {
  return {
    event: "back_to_school",
    language: "en",
    budget: over.budget === undefined ? 1_500_000 : over.budget,
    deadline: over.deadline === undefined ? "2026-09-05" : over.deadline,
    items: [
      it("backpack", "school-backpack", {
        needLabel: "Anti-hunchback backpack",
        mustHaveTags: ["anti-hunchback", "grade-1", "kids"],
        niceToHaveTags: ["lightweight"],
        maxUnitPrice: 400_000,
      }),
      it("notebooks", "notebooks", { quantity: 0, mustHaveTags: ["grade-1"] }),
      it("pencils", "pencils-pens", { quantity: 4, mustHaveTags: ["kids"] }),
      it("pencil-case", "pencil-case"),
      it("water-bottle", "water-bottle", { niceToHaveTags: ["bpa-free"] }),
      it("lunch-box", "lunch-box", { required: false }),
      it("shoes", "school-shoes", { mustHaveTags: ["kids", "budget"] }),
      it("uniform", "uniform-shirt", { quantity: 5 }),
      it("book-covers", "book-covers", { quantity: 4 }),
    ],
    assumptions: ["By Sep 5 (school opening)", "1 child"],
  };
}

export function puppyPlan(budget: number | null = null) {
  return {
    event: "other",
    language: "en",
    budget,
    deadline: null,
    items: [it("dog-food", null, { needLabel: "Dog food" }), it("dog-bed", null, { needLabel: "Dog bed" })],
    assumptions: [],
  };
}

/** The refine planner's output: a (sloppy) plan + intent (CONTRACT §3, D42). */
export function refineOutput<P extends object>(plan: P, intent: "change_kit" | "answer" = "change_kit") {
  return { intent, ...plan };
}

/** sloppyHeroPlan without some items (by key). */
export function heroWithout(keys: string[], over: Parameters<typeof sloppyHeroPlan>[0] = {}) {
  const p = sloppyHeroPlan(over);
  return { ...p, items: p.items.filter((i) => !keys.includes(i.key)) };
}
