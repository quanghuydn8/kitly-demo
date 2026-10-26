// Seam S1 — Optimizer: plan + scored candidates + shops + vouchers + profile → BasketOption (pure, deterministic).
import { describe, expect, it } from "vitest";
import { BasketOptionSchema } from "@/contract";
import type { BasketOption, Candidate, KitPlan, PlanItem, Product, Shop, Voucher } from "@/contract";
import { fixtures } from "@/contract/fixtures";
import { optimize, type OptimizerInput } from "@/server/optimizer";

const TODAY = "2026-08-20";

// ---------- builders (input data only; nothing of ours is faked) ----------

function shop(id: string, shipFee = 25000, over: Partial<Shop> = {}): Shop {
  return { id, name: `Shop ${id}`, tier: "regular", rating: 4.5, shipFee, city: "Hanoi", ...over };
}

function product(id: string, shopId: string, price: number, over: Partial<Product> = {}): Product {
  return {
    id,
    shopId,
    title: `Product ${id}`,
    category: "notebooks",
    description: "d",
    price,
    rating: 4.5,
    reviewCount: 100,
    soldCount: 100,
    stock: 50,
    tags: [],
    attributes: {},
    shipDaysMin: 1,
    shipDaysMax: 3,
    updatedForDemandAt: null,
    ...over,
  };
}

function cand(p: Product, s: Shop, score: number): Candidate {
  return { product: p, shop: s, score, matchedTags: [], arrivesBy: "2026-08-23" };
}

function item(key: string, over: Partial<PlanItem> = {}): PlanItem {
  return {
    key,
    needLabel: `Need ${key}`,
    category: "notebooks",
    required: true,
    quantity: 1,
    mustHaveTags: [],
    niceToHaveTags: [],
    maxUnitPrice: null,
    ...over,
  };
}

function plan(items: PlanItem[], budget: number | null): KitPlan {
  return { event: "back_to_school", language: "en", budget, deadline: "2026-08-25", items, assumptions: [] };
}

function voucher(code: string, over: Partial<Voucher>): Voucher {
  return {
    id: `v-${code}`,
    scope: "platform",
    shopId: null,
    code,
    kind: "fixed",
    value: 0,
    maxDiscount: null,
    minSpend: 0,
    validUntil: "2026-09-30",
    ...over,
  };
}

function input(
  p: KitPlan,
  candidates: Record<string, Candidate[]>,
  more: Partial<OptimizerInput> = {},
): OptimizerInput {
  const shops = new Map<string, Shop>();
  for (const cs of Object.values(candidates)) for (const c of cs) shops.set(c.shop.id, c.shop);
  return {
    plan: p,
    candidates,
    shops: [...shops.values()],
    vouchers: [],
    profile: "balanced",
    today: TODAY,
    ...more,
  };
}

/** Invariants every option must satisfy (money adds up, groups add up, contract shape). */
function checkMoney(o: BasketOption, vouchers: Voucher[]) {
  expect(BasketOptionSchema.safeParse(o).success).toBe(true);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  expect(o.itemsTotal).toBe(sum(o.lines.map((l) => l.lineTotal)));
  for (const l of o.lines) expect(l.lineTotal).toBe(l.product.price * l.quantity);
  expect(o.grandTotal).toBe(o.itemsTotal + o.shippingTotal - o.discountTotal);
  expect(sum(o.shops.map((g) => g.subtotal))).toBe(o.itemsTotal);
  expect(sum(o.shops.map((g) => g.shipping))).toBe(o.shippingTotal);
  // one group per shop, each group = the lines of that shop, shipping = shop fee once
  expect(new Set(o.shops.map((g) => g.shopId)).size).toBe(o.shops.length);
  for (const g of o.shops) {
    const lines = o.lines.filter((l) => l.shop.id === g.shopId);
    expect(lines.length).toBeGreaterThan(0);
    expect(g.subtotal).toBe(sum(lines.map((l) => l.lineTotal)));
    expect(g.shipping).toBe(lines[0].shop.shipFee);
    // shop vouchers: at most one per shop, min spend respected
    const shopCodes = g.voucherCodes.filter((c) => vouchers.find((v) => v.code === c)?.scope === "shop");
    expect(shopCodes.length).toBeLessThanOrEqual(1);
    for (const c of g.voucherCodes) {
      const v = vouchers.find((x) => x.code === c)!;
      expect(g.subtotal).toBeGreaterThanOrEqual(v.minSpend);
      if (v.scope === "shop") expect(v.shopId).toBe(g.shopId);
    }
    if (shopCodes.length === 0) expect(g.shopDiscount).toBe(0);
  }
  expect(o.discountTotal).toBeGreaterThanOrEqual(0);
  expect(o.grandTotal).toBeGreaterThanOrEqual(0);
}

/** Free-shipping coverage implied by the groups (FREESHIP code on a group covers up to its value). */
function freeshipCoverage(o: BasketOption, vouchers: Voucher[]) {
  let total = 0;
  for (const g of o.shops) {
    const fs = g.voucherCodes
      .map((c) => vouchers.find((v) => v.code === c)!)
      .filter((v) => v.kind === "freeship");
    expect(fs.length).toBeLessThanOrEqual(1);
    if (fs[0]) total += Math.min(fs[0].value, g.shipping);
  }
  return total;
}

// ---------- seeded PRNG for the property test ----------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FREESHIP = voucher("FREESHIP", { kind: "freeship", value: 30000, minSpend: 200000 });
const KITLY50 = voucher("KITLY50", { kind: "fixed", value: 50000, minSpend: 1000000 });
const SAVE5 = voucher("SAVE5", { kind: "percent", value: 5, maxDiscount: 40000, minSpend: 500000 });

describe("optimize — money (S1)", () => {
  it("property: status ok ⇒ grandTotal ≤ budget; totals and groups always add up", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const pick = (n: number) => Math.floor(r() * n);
      const shops = Array.from({ length: 2 + pick(3) }, (_, i) => shop(`s${i}`, 15000 + pick(5) * 5000));
      const items = Array.from({ length: 1 + pick(5) }, (_, i) =>
        item(`i${i}`, { required: r() < 0.6, quantity: 1 + pick(2) }),
      );
      const candidates: Record<string, Candidate[]> = {};
      for (const it of items) {
        candidates[it.key] = Array.from({ length: 1 + pick(4) }, (_, j) => {
          const s = shops[pick(shops.length)];
          return cand(product(`${it.key}-${j}`, s.id, (20 + pick(400)) * 1000), s, 0.3 + r() * 0.7);
        });
      }
      const vouchers = [
        FREESHIP,
        KITLY50,
        SAVE5,
        voucher("S0OFF", { scope: "shop", shopId: "s0", value: 20000, minSpend: 150000 }),
      ];
      const budget = r() < 0.15 ? null : (100 + pick(1500)) * 1000;
      for (const profile of ["saver", "balanced", "premium"] as const) {
        const o = optimize(input(plan(items, budget), candidates, { vouchers, profile }));
        checkMoney(o, vouchers);
        if (o.status === "ok" && budget !== null) expect(o.grandTotal).toBeLessThanOrEqual(budget);
        if (budget === null) expect(o.status).toBe("ok");
        // platform part of the discount is a single voucher: KITLY50 (50k) or SAVE5 (≤ 40k), never both
        const platformPart =
          o.discountTotal - o.shops.reduce((s, g) => s + g.shopDiscount, 0) - freeshipCoverage(o, vouchers);
        expect(platformPart).toBeGreaterThanOrEqual(0);
        expect(platformPart).toBeLessThanOrEqual(50000);
        // every plan item is accounted for exactly once
        const keys = [
          ...o.lines.map((l) => l.itemKey),
          ...o.noMatch.map((n) => n.itemKey),
          ...o.skipped.map((s) => s.itemKey),
        ];
        expect(keys.sort()).toEqual(items.map((i) => i.key).sort());
        // must-haves are never skipped
        for (const s of o.skipped) expect(items.find((i) => i.key === s.itemKey)!.required).toBe(false);
        if (o.status === "over_budget") {
          expect(o.minimumCost).toBeGreaterThan(budget!);
          expect(o.costDrivers!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("shipping is the shop fee once per shop group; FREESHIP covers up to its value when subtotal ≥ min spend", () => {
    const a = shop("a", 25000);
    const b = shop("b", 40000);
    const p = plan([item("x"), item("y"), item("z")], 2000000);
    const o = optimize(
      input(
        p,
        {
          x: [cand(product("x1", "a", 120000), a, 0.9)],
          y: [cand(product("y1", "a", 100000), a, 0.9)],
          z: [cand(product("z1", "b", 150000), b, 0.9)],
        },
        { vouchers: [FREESHIP] },
      ),
    );
    checkMoney(o, [FREESHIP]);
    const ga = o.shops.find((g) => g.shopId === "a")!;
    const gb = o.shops.find((g) => g.shopId === "b")!;
    expect(ga.shipping).toBe(25000);
    expect(gb.shipping).toBe(40000);
    expect(o.shippingTotal).toBe(65000);
    // a: 220k ≥ 200k → free shipping covers all 25k; b: 150k < 200k → no FREESHIP
    expect(ga.voucherCodes).toContain("FREESHIP");
    expect(gb.voucherCodes).not.toContain("FREESHIP");
    expect(o.discountTotal).toBe(25000);
    expect(o.grandTotal).toBe(370000 + 65000 - 25000);

    // FREESHIP caps at its value when the fee is higher
    const o2 = optimize(
      input(
        plan([item("z")], 2000000),
        { z: [cand(product("z2", "b", 250000), b, 0.9)] },
        { vouchers: [FREESHIP] },
      ),
    );
    expect(o2.discountTotal).toBe(30000);
    expect(o2.grandTotal).toBe(250000 + 40000 - 30000);
  });

  it("applies at most one platform discount voucher (the best one) and the best shop voucher meeting min spend", () => {
    const a = shop("a", 20000);
    const shopVouchers = [
      voucher("A10", { scope: "shop", shopId: "a", value: 10000, minSpend: 100000 }),
      voucher("A80", { scope: "shop", shopId: "a", value: 80000, minSpend: 2000000 }), // min spend not met
      voucher("A30", { scope: "shop", shopId: "a", value: 30000, minSpend: 500000 }),
      voucher("OTHER", { scope: "shop", shopId: "zzz", value: 99000, minSpend: 0 }), // other shop
    ];
    const vouchers = [KITLY50, SAVE5, ...shopVouchers];
    const o = optimize(
      input(
        plan([item("x"), item("y")], 3000000),
        {
          x: [cand(product("x1", "a", 700000), a, 0.9)],
          y: [cand(product("y1", "a", 500000), a, 0.9)],
        },
        { vouchers },
      ),
    );
    checkMoney(o, vouchers);
    const g = o.shops[0];
    expect(g.voucherCodes).toEqual(["A30"]);
    expect(g.shopDiscount).toBe(30000);
    // platform: KITLY50 (50k, min 1M met) vs SAVE5 (5% capped 40k) → only KITLY50
    expect(o.discountTotal).toBe(30000 + 50000);
    expect(o.savings.some((s) => s.label.includes("KITLY50") && s.amount === 50000)).toBe(true);
    expect(o.savings.some((s) => s.label.includes("SAVE5"))).toBe(false);
  });

  it("expired vouchers are ignored", () => {
    const a = shop("a", 20000);
    const old = voucher("OLD", { value: 50000, validUntil: "2026-08-19" });
    const o = optimize(
      input(
        plan([item("x")], 900000),
        { x: [cand(product("x1", "a", 300000), a, 0.9)] },
        { vouchers: [old] },
      ),
    );
    expect(o.discountTotal).toBe(0);
  });
});

describe("optimize — choices (S1)", () => {
  it("must-haves are chosen before nice-to-haves; nice-to-haves dropped for budget appear in skipped", () => {
    const a = shop("a", 20000);
    const p = plan(
      [item("need"), item("nice1", { required: false }), item("nice2", { required: false })],
      330000,
    );
    const o = optimize(
      input(p, {
        need: [cand(product("n1", "a", 200000), a, 0.6)],
        nice1: [cand(product("m1", "a", 150000), a, 0.95)],
        nice2: [cand(product("m2", "a", 90000), a, 0.9)],
      }),
    );
    expect(o.status).toBe("ok");
    expect(o.grandTotal).toBeLessThanOrEqual(330000);
    expect(o.lines.map((l) => l.itemKey).sort()).toEqual(["need", "nice2"]);
    expect(o.skipped).toEqual([{ itemKey: "nice1", needLabel: "Need nice1", reason: "budget" }]);
  });

  it("items with no candidate → noMatch with the reason passed in from the Matcher (no_category for null category)", () => {
    const a = shop("a");
    const p = plan(
      [
        item("pet", { category: null }),
        item("bag", { needLabel: "Anti-hunchback backpack" }),
        item("late"),
        item("ok"),
      ],
      1000000,
    );
    const o = optimize(
      input(
        p,
        { pet: [], bag: [], ok: [cand(product("o1", "a", 100000), a, 0.8)] },
        {
          noMatchReasons: { bag: "none_in_budget", late: "none_in_time" },
        },
      ),
    );
    expect(o.noMatch).toEqual([
      { itemKey: "pet", needLabel: "Need pet", reason: "no_category" },
      { itemKey: "bag", needLabel: "Anti-hunchback backpack", reason: "none_in_budget" },
      { itemKey: "late", needLabel: "Need late", reason: "none_in_time" },
    ]);
    expect(o.lines.map((l) => l.itemKey)).toEqual(["ok"]);
  });

  it("an item with a category, no candidates and no reason from the Matcher → no_product_with_tags", () => {
    const o = optimize(input(plan([item("x")], 500000), { x: [] }));
    expect(o.noMatch).toEqual([{ itemKey: "x", needLabel: "Need x", reason: "no_product_with_tags" }]);
  });

  it("consolidation: a near-equal candidate at a shop already in the basket wins when it lowers total cost, with a savings line", () => {
    const a = shop("a", 30000, { name: "Minh An Stationery" });
    const b = shop("b", 30000, { name: "Other Shop" });
    const p = plan([item("x"), item("y")], 1000000);
    const o = optimize(
      input(p, {
        x: [cand(product("x-a", "a", 100000), a, 0.9)],
        // y at b is slightly better and slightly cheaper alone, but costs a second shipping fee
        y: [cand(product("y-b", "b", 95000), b, 0.82), cand(product("y-a", "a", 100000), a, 0.8)],
      }),
    );
    expect(o.lines.find((l) => l.itemKey === "y")!.product.id).toBe("y-a");
    expect(o.shops).toHaveLength(1);
    expect(o.grandTotal).toBe(230000);
    const line = o.savings.find((s) => s.label.includes("Minh An Stationery") && s.label.includes("2 items"));
    expect(line).toBeDefined();
    expect(line!.amount).toBe(25000); // (95k + 30k extra shipping) − 100k
    // the chosen line explains itself
    expect(o.lines.find((l) => l.itemKey === "y")!.reason).toMatch(/same shop/i);
  });

  it("does not consolidate when the other shop is clearly better", () => {
    const a = shop("a", 30000);
    const b = shop("b", 30000);
    const o = optimize(
      input(plan([item("x"), item("y")], 2000000), {
        x: [cand(product("x-a", "a", 100000), a, 0.9)],
        y: [cand(product("y-b", "b", 100000), b, 0.95), cand(product("y-a", "a", 100000), a, 0.4)],
      }),
    );
    expect(o.lines.find((l) => l.itemKey === "y")!.product.id).toBe("y-b");
  });

  it("must-haves alone over budget ⇒ over_budget with minimumCost and top-3 cost drivers", () => {
    const a = shop("a", 20000);
    const p = plan(
      [
        item("shoes", { needLabel: "School shoes" }),
        item("bag", { needLabel: "Backpack" }),
        item("book", { needLabel: "Notebooks" }),
        item("pen", { needLabel: "Pens" }),
        item("toy", { needLabel: "Toy", required: false }),
      ],
      200000,
    );
    const o = optimize(
      input(p, {
        shoes: [cand(product("sh", "a", 150000), a, 0.9), cand(product("sh2", "a", 300000), a, 0.99)],
        bag: [cand(product("bg", "a", 120000), a, 0.9)],
        book: [cand(product("bk", "a", 60000), a, 0.9)],
        pen: [cand(product("pn", "a", 30000), a, 0.9)],
        toy: [cand(product("ty", "a", 10000), a, 0.9)],
      }),
    );
    expect(o.status).toBe("over_budget");
    expect(o.minimumCost).toBe(150000 + 120000 + 60000 + 30000 + 20000);
    expect(o.costDrivers).toHaveLength(3);
    expect(o.costDrivers![0]).toContain("School shoes");
    expect(o.costDrivers![1]).toContain("Backpack");
    expect(o.costDrivers![2]).toContain("Notebooks");
    expect(o.lines.every((l) => l.itemKey !== "toy")).toBe(true);
    checkMoney(o, []);
  });

  it("budget null ⇒ always ok, includes every item, prefers higher score", () => {
    const a = shop("a", 20000);
    const o = optimize(
      input(plan([item("x"), item("y", { required: false })], null), {
        x: [cand(product("x-cheap", "a", 100000), a, 0.5), cand(product("x-good", "a", 130000), a, 0.95)],
        y: [cand(product("y1", "a", 3000000), a, 0.7)],
      }),
    );
    expect(o.status).toBe("ok");
    expect(o.lines.map((l) => l.product.id).sort()).toEqual(["x-good", "y1"]);
    expect(o.minimumCost).toBeUndefined();
  });

  it("quantity multiplies the line total", () => {
    const a = shop("a", 20000);
    const o = optimize(
      input(plan([item("u", { quantity: 2 })], 1000000), { u: [cand(product("u1", "a", 129000), a, 0.9)] }),
    );
    expect(o.lines[0].lineTotal).toBe(258000);
    expect(o.itemsTotal).toBe(258000);
  });

  it("alternatives: up to 2 next-best candidates from other shops", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => shop(id, 20000));
    const o = optimize(
      input(plan([item("x")], 5000000), {
        x: [
          cand(product("x-a", "a", 100000), a, 0.95),
          cand(product("x-a2", "a", 100000), a, 0.9), // same shop as chosen → never an alternative
          cand(product("x-b", "b", 100000), b, 0.7),
          cand(product("x-c", "c", 100000), c, 0.85),
          cand(product("x-d", "d", 100000), d, 0.6),
        ],
      }),
    );
    const l = o.lines[0];
    expect(l.product.id).toBe("x-a");
    expect(l.alternatives.map((x) => x.product.id)).toEqual(["x-c", "x-b"]);
  });

  it("is deterministic", () => {
    const a = shop("a", 20000);
    const b = shop("b", 25000);
    const inp = input(
      plan([item("x"), item("y", { required: false })], 400000),
      {
        x: [cand(product("x-a", "a", 100000), a, 0.8), cand(product("x-b", "b", 90000), b, 0.8)],
        y: [cand(product("y-a", "a", 150000), a, 0.7), cand(product("y-b", "b", 140000), b, 0.75)],
      },
      { vouchers: [FREESHIP] },
    );
    expect(optimize(inp)).toEqual(optimize(inp));
  });
});

// ---------- fixture-backed scenario (DEMO.md Beat 1 shape) ----------

function fixtureCandidates(p: KitPlan): Record<string, Candidate[]> {
  const shops = new Map(fixtures.shops.map((s) => [s.id, s]));
  const out: Record<string, Candidate[]> = {};
  for (const it of p.items) {
    out[it.key] = fixtures.products
      .filter(
        (pr) =>
          pr.category === it.category &&
          pr.stock > 0 &&
          pr.shipDaysMax <= 5 && // arrives by Aug 25
          it.mustHaveTags.every((t) => pr.tags.includes(t)) &&
          (it.maxUnitPrice === null || pr.price <= it.maxUnitPrice),
      )
      .map((pr) => ({
        product: pr,
        shop: shops.get(pr.shopId)!,
        score:
          Math.round(
            (pr.rating / 5) * 0.8 * 1000 +
              (it.niceToHaveTags.filter((t) => pr.tags.includes(t)).length > 0 ? 150 : 0),
          ) / 1000,
        matchedTags: [],
        arrivesBy: "2026-08-24",
      }));
  }
  return out;
}

const HERO_PLAN = (budget: number | null): KitPlan => ({
  event: "back_to_school",
  language: "en",
  budget,
  deadline: "2026-08-25",
  assumptions: [],
  items: [
    item("backpack", { category: "school-backpack", mustHaveTags: ["anti-hunchback"], maxUnitPrice: 400000 }),
    item("notebooks", { category: "notebooks", mustHaveTags: ["grade-1"] }),
    item("pencils", { category: "pencils-pens", niceToHaveTags: ["grade-1"] }),
    item("pencil-case", { category: "pencil-case" }),
    item("water-bottle", {
      category: "water-bottle",
      mustHaveTags: ["leak-proof"],
      niceToHaveTags: ["insulated"],
    }),
    item("lunch-box", { category: "lunch-box", required: false, niceToHaveTags: ["insulated"] }),
    item("shoes", { category: "school-shoes", niceToHaveTags: ["non-slip"] }),
    item("uniform", { category: "uniform-shirt", quantity: 2, niceToHaveTags: ["premium"] }),
    item("crayons", { category: "crayons-paints", required: false }),
  ],
});

describe("optimize — hero fixture", () => {
  it("Beat 1: ok within 1.5M, backpack is an honest gap, no Bago items, Minh An saving shown", () => {
    const p = HERO_PLAN(1500000);
    const o = optimize({
      plan: p,
      candidates: fixtureCandidates(p),
      noMatchReasons: { backpack: "none_in_budget" },
      shops: fixtures.shops,
      vouchers: fixtures.vouchers,
      profile: "balanced",
      today: TODAY,
    });
    checkMoney(o, fixtures.vouchers);
    expect(o.status).toBe("ok");
    expect(o.grandTotal).toBeLessThanOrEqual(1500000);
    expect(o.noMatch.map((n) => n.itemKey)).toEqual(["backpack"]);
    expect(o.lines.some((l) => l.shop.id === "shop-bago")).toBe(false);
    expect(o.savings.some((s) => s.label.includes("Minh An Stationery"))).toBe(true);
  });

  it("Full: saver / balanced / premium produce different baskets, saver ≤ balanced ≤ premium, all ≤ budget", () => {
    const p = HERO_PLAN(1500000);
    const base = {
      plan: p,
      candidates: fixtureCandidates(p),
      shops: fixtures.shops,
      vouchers: fixtures.vouchers,
      today: TODAY,
    };
    const [saver, balanced, premium] = (["saver", "balanced", "premium"] as const).map((profile) =>
      optimize({ ...base, profile }),
    );
    for (const o of [saver, balanced, premium]) {
      checkMoney(o, fixtures.vouchers);
      expect(o.status).toBe("ok");
      expect(o.grandTotal).toBeLessThanOrEqual(1500000);
    }
    expect(saver.profile).toBe("saver");
    expect(premium.profile).toBe("premium");
    expect(saver.grandTotal).toBeLessThanOrEqual(balanced.grandTotal);
    expect(balanced.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
    expect(saver.grandTotal).toBeLessThan(premium.grandTotal);
    const ids = (o: BasketOption) =>
      o.lines
        .map((l) => l.product.id)
        .sort()
        .join(",");
    expect(ids(saver)).not.toBe(ids(premium));
    const meanScore = (o: BasketOption) => {
      const cs = base.candidates;
      const s = o.lines.map((l) => cs[l.itemKey].find((c) => c.product.id === l.product.id)!.score);
      return s.reduce((a, b) => a + b, 0) / s.length;
    };
    expect(meanScore(premium)).toBeGreaterThan(meanScore(saver));
  });

  it("Full: saver minimises cost subject to a score floor (never picks a candidate far below the best)", () => {
    const a = shop("a", 20000);
    const o = optimize(
      input(
        plan([item("x")], 1000000),
        {
          x: [
            cand(product("junk", "a", 10000), a, 0.2), // cheapest but below the floor
            cand(product("ok", "a", 60000), a, 0.85),
            cand(product("best", "a", 200000), a, 0.95),
          ],
        },
        { profile: "saver" },
      ),
    );
    expect(o.lines[0].product.id).toBe("ok");
    const prem = optimize(
      input(
        plan([item("x")], 1000000),
        {
          x: [cand(product("ok", "a", 60000), a, 0.85), cand(product("best", "a", 200000), a, 0.95)],
        },
        { profile: "premium" },
      ),
    );
    expect(prem.lines[0].product.id).toBe("best");
  });
});

describe("optimize — performance (Full)", () => {
  it("12 items × 8 candidates, budget 5,000,000 runs < 200 ms", () => {
    const r = rng(42);
    const shops = Array.from({ length: 10 }, (_, i) => shop(`s${i}`, 15000 + (i % 5) * 5000));
    const items = Array.from({ length: 12 }, (_, i) => item(`i${i}`, { required: i < 8 }));
    const candidates: Record<string, Candidate[]> = {};
    for (const it of items) {
      candidates[it.key] = Array.from({ length: 8 }, (_, j) => {
        const s = shops[Math.floor(r() * shops.length)];
        return cand(product(`${it.key}-${j}`, s.id, (50 + Math.floor(r() * 700)) * 1000), s, 0.4 + r() * 0.6);
      });
    }
    const vouchers = [
      FREESHIP,
      KITLY50,
      SAVE5,
      voucher("S1", { scope: "shop", shopId: "s1", value: 30000, minSpend: 300000 }),
    ];
    const inp = input(plan(items, 5000000), candidates, { vouchers });
    optimize(inp); // warm-up (JIT)
    for (const profile of ["saver", "balanced", "premium"] as const) {
      const t0 = performance.now();
      const o = optimize({ ...inp, profile });
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(200);
      expect(o.grandTotal).toBeLessThanOrEqual(5000000);
    }
  });
});
