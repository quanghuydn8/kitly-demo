import { describe, expect, it } from "vitest";
import type { Product, Shop } from "@/contract";
import { depthProblems, enforceDepth } from "@/server/seed/depth";

const shops: Shop[] = [
  { id: "s-mall", name: "Big Mall", tier: "mall", rating: 4.9, shipFee: 30000, city: "HCMC" },
  { id: "s-pref", name: "Pref Shop", tier: "preferred", rating: 4.6, shipFee: 25000, city: "Hanoi" },
  { id: "s-reg", name: "Reg Shop", tier: "regular", rating: 4.2, shipFee: 15000, city: "Da Nang" },
];
const p = (id: string, price: number, over: Partial<Product> = {}): Product => ({
  id,
  shopId: "s-reg",
  title: `Thing ${id}`,
  category: "desk-fan",
  description: "A fan.",
  price,
  rating: 4.3,
  reviewCount: 100,
  soldCount: 300,
  stock: 50,
  tags: ["quiet"],
  attributes: { power: "25 W" },
  shipDaysMin: 1,
  shipDaysMax: 3,
  updatedForDemandAt: null,
  ...over,
});

describe("depthProblems (DATA.md §3 depth rule + §4 express rule)", () => {
  it("accepts a deep category", () => {
    const ok = [
      p("a", 200000, { shipDaysMax: 2 }),
      p("b", 250000),
      p("c", 300000),
      p("d", 380000),
      p("e", 520000, { shopId: "s-mall" }),
      p("f", 650000, { shipDaysMin: 5, shipDaysMax: 8 }),
    ];
    expect(depthProblems(ok, shops)).toEqual([]);
  });

  // rehearsal 2 (31/10): "Giao hoả tốc" (deadline today + 2) left one express product per category — the best-rated,
  // i.e. the most expensive — and the hero kit jumped to 3.555.000₫, 2M over budget. Express must include a cheap pick.
  it("express: the cheapest in-stock product must ship in ≤ 2 days, not only some product", () => {
    const onlyPremiumExpress = [
      p("a", 200000),
      p("b", 250000),
      p("c", 300000),
      p("d", 380000),
      p("e", 520000, { shopId: "s-mall", shipDaysMax: 2, rating: 4.9 }),
    ];
    expect(depthProblems(onlyPremiumExpress, shops)).toEqual(["express"]);
    const fixed = enforceDepth(onlyPremiumExpress, { category: "desk-fan", shops });
    expect(depthProblems(fixed, shops)).toEqual([]);
    expect(fixed.find((x) => x.id === "a")!).toMatchObject({ shipDaysMin: 1, shipDaysMax: 2 });
    expect(fixed.find((x) => x.id === "e")!.shipDaysMax).toBe(2);
  });

  it("names every failed check", () => {
    const shallow = [
      p("a", 200000, { shipDaysMin: 3, shipDaysMax: 3 }),
      p("b", 250000),
      p("c", 300000, { stock: 0 }),
      p("d", 380000, { shipDaysMin: 4, shipDaysMax: 6 }),
    ];
    expect(depthProblems(shallow, shops).sort()).toEqual(["count", "express", "quality", "spread"]);
  });
});

describe("enforceDepth", () => {
  it("fixes a shallow category: shortens slow products, then plants fill products", () => {
    const shallow = [
      p("a", 200000, { shipDaysMin: 3, shipDaysMax: 3, rating: 4.5 }),
      p("b", 250000),
      p("c", 300000, { stock: 0 }),
      p("d", 380000, { shipDaysMin: 4, shipDaysMax: 6 }),
    ];
    const out = enforceDepth(shallow, { category: "desk-fan", shops });
    expect(depthProblems(out, shops)).toEqual([]);
    // the slow in-stock product now arrives within 3 days; originals are kept
    expect(out.find((x) => x.id === "d")!.shipDaysMax).toBeLessThanOrEqual(3);
    expect(out.map((x) => x.id)).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
    // the express rule picks the best-rated in-stock product
    expect(out.find((x) => x.id === "a")!).toMatchObject({ shipDaysMin: 1, shipDaysMax: 2 });
    const planted = out.filter((x) => !["a", "b", "c", "d"].includes(x.id));
    expect(planted.length).toBeGreaterThan(0);
    for (const x of planted) {
      expect(x.category).toBe("desk-fan");
      expect(shops.map((s) => s.id)).toContain(x.shopId);
      expect(x.description.split(". ").length).toBeGreaterThanOrEqual(2);
      expect(x.price % 1000).toBe(0);
    }
    expect(new Set(out.map((x) => x.id)).size).toBe(out.length);
  });

  it("never plants gap tags", () => {
    const shallow = [p("a", 200000, { tags: ["anti-blue-light", "backpack-cover", "anti-hunchback", "quiet"] })];
    const out = enforceDepth(shallow, { category: "desk-fan", shops });
    const planted = out.filter((x) => x.id !== "a");
    for (const x of planted)
      expect(x.tags.some((t) => ["anti-blue-light", "backpack-cover", "anti-hunchback"].includes(t))).toBe(false);
    expect(depthProblems(out, shops)).toEqual([]);
  });

  it("leaves a deep category untouched", () => {
    const ok = [
      p("a", 200000, { shipDaysMax: 2 }),
      p("b", 250000),
      p("c", 300000),
      p("d", 380000),
      p("e", 520000, { shopId: "s-mall" }),
    ];
    expect(enforceDepth(ok, { category: "desk-fan", shops })).toEqual(ok);
  });

  it("works on an empty category (every LLM call failed)", () => {
    const out = enforceDepth([], { category: "desk-fan", shops });
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(depthProblems(out, shops)).toEqual([]);
  });
});
