// Seam S5 — Matcher: plan + CommerceAdapter → scored candidates per plan item (pure code over the InMemoryAdapter).
import { describe, expect, it } from "vitest";
import type { KitPlan, PlanItem } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/memory";
import { matchPlan } from "@/server/kit/matcher";

const TODAY = "2026-08-20";

const item = (key: string, over: Partial<PlanItem> = {}): PlanItem => ({
  key,
  needLabel: key,
  category: "school-backpack",
  required: true,
  quantity: 1,
  mustHaveTags: [],
  niceToHaveTags: [],
  maxUnitPrice: null,
  ...over,
});

const plan = (items: PlanItem[], deadline: string | null = null): KitPlan => ({
  event: "back_to_school",
  language: "en",
  budget: null,
  deadline,
  items,
  assumptions: [],
});

const ids = (cs: { product: { id: string } }[]) => cs.map((c) => c.product.id).sort();

describe("matchPlan", () => {
  it("returns every in-category product when there is no constraint, with arrivesBy = today + shipDaysMax", async () => {
    const r = await matchPlan(new InMemoryAdapter(), plan([item("bag")]), TODAY);
    const m = r.byItem.bag;
    expect(m.reason).toBeNull();
    expect(m.candidates).toHaveLength(7);
    const bago = m.candidates.find((c) => c.product.id === "prod-bago-basic-backpack")!;
    expect(bago.arrivesBy).toBe("2026-08-29"); // ships 9 days
    expect(bago.shop.id).toBe("shop-bago");
  });

  it("deadline filter: products arriving after the deadline are dropped (Bago ships 6–9 days)", async () => {
    const r = await matchPlan(new InMemoryAdapter(), plan([item("bag")], "2026-08-25"), TODAY);
    const m = r.byItem.bag;
    expect(m.candidates.some((c) => c.shop.id === "shop-bago")).toBe(false);
    expect(m.candidates.length).toBe(4);
    for (const c of m.candidates) expect(c.arrivesBy <= "2026-08-25").toBe(true);
  });

  it("deadline filter alone emptying the item → none_in_time", async () => {
    const r = await matchPlan(new InMemoryAdapter(), plan([item("bag")], "2026-08-21"), TODAY);
    expect(r.byItem.bag.candidates).toEqual([]);
    expect(r.byItem.bag.reason).toBe("none_in_time");
  });

  it("must-have tag filter: every mustHaveTag must be present", async () => {
    const r = await matchPlan(
      new InMemoryAdapter(),
      plan([item("light", { mustHaveTags: ["lightweight"] }), item("both", { mustHaveTags: ["lightweight", "grade-1"] })]),
      TODAY,
    );
    expect(ids(r.byItem.light.candidates)).toEqual(
      ["prod-kidzone-air-backpack", "prod-kidzone-ergo-backpack", "prod-minhan-light-backpack"].sort(),
    );
    expect(ids(r.byItem.both.candidates)).toEqual(["prod-kidzone-ergo-backpack"]);
    expect(r.byItem.light.candidates[0].matchedTags).toContain("lightweight");
  });

  it("no product with the tags → no_product_with_tags (raincoat with backpack-cover)", async () => {
    const r = await matchPlan(
      new InMemoryAdapter(),
      plan([item("rain", { category: "kids-raincoat", mustHaveTags: ["backpack-cover"] })]),
      TODAY,
    );
    expect(r.byItem.rain).toEqual({ candidates: [], reason: "no_product_with_tags" });
  });

  it("maxUnitPrice filter; tag + time ok but too expensive → none_in_budget (hero backpack)", async () => {
    const r = await matchPlan(
      new InMemoryAdapter(),
      plan(
        [
          item("cheap", { maxUnitPrice: 250000 }),
          item("hero", { mustHaveTags: ["anti-hunchback"], maxUnitPrice: 400000 }),
        ],
        "2026-08-25",
      ),
      TODAY,
    );
    // ≤ 250k are all Bago (too slow): time removes Bago, then price empties the in-time ones → last stage wins.
    expect(r.byItem.cheap.reason).toBe("none_in_budget");
    expect(r.byItem.hero).toEqual({ candidates: [], reason: "none_in_budget" });
    const noDeadline = await matchPlan(new InMemoryAdapter(), plan([item("cheap", { maxUnitPrice: 250000 })]), TODAY);
    expect(noDeadline.byItem.cheap.candidates.every((c) => c.product.price <= 250000)).toBe(true);
    expect(noDeadline.byItem.cheap.candidates).toHaveLength(3);
  });

  it("category null → no_category without touching the catalog", async () => {
    const r = await matchPlan(new InMemoryAdapter(), plan([item("puppy-food", { category: null })]), TODAY);
    expect(r.byItem["puppy-food"]).toEqual({ candidates: [], reason: "no_category" });
  });

  it("out-of-stock products are never candidates (fixture kids lamp has stock 0)", async () => {
    const r = await matchPlan(new InMemoryAdapter(), plan([item("lamp", { category: "kids-desk-lamp" })]), TODAY);
    expect(r.byItem.lamp.candidates.map((c) => c.product.id)).not.toContain("prod-minhan-kids-lamp");
  });

  it("score ordering: sorted best-first, scores in (0,1], nice-to-have tag match raises the score", async () => {
    const r = await matchPlan(
      new InMemoryAdapter(),
      plan([item("bag", { niceToHaveTags: ["lightweight"] })], "2026-08-25"),
      TODAY,
    );
    const cs = r.byItem.bag.candidates;
    for (let i = 1; i < cs.length; i++) expect(cs[i - 1].score).toBeGreaterThanOrEqual(cs[i].score);
    for (const c of cs) {
      expect(c.score).toBeGreaterThan(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
    const hero = cs.find((c) => c.product.id === "prod-minhan-backpack")!; // no lightweight tag
    const light = cs.find((c) => c.product.id === "prod-minhan-light-backpack")!; // same shop, has it
    expect(light.matchedTags).toEqual(["lightweight"]);
    expect(hero.matchedTags).toEqual([]);
    // Asking for the nice-to-have tag widens the gap in favour of the product that has it.
    const plain = (await matchPlan(new InMemoryAdapter(), plan([item("bag")], "2026-08-25"), TODAY)).byItem.bag
      .candidates;
    const gap = (list: typeof cs) =>
      list.find((c) => c.product.id === light.product.id)!.score - list.find((c) => c.product.id === hero.product.id)!.score;
    expect(gap(cs)).toBeGreaterThan(gap(plain) + 0.1);
  });

  it("is deterministic and reports how many products / shops were compared", async () => {
    const p = plan([item("bag"), item("rain", { category: "kids-raincoat" }), item("x", { category: null })]);
    const a = await matchPlan(new InMemoryAdapter(), p, TODAY);
    const b = await matchPlan(new InMemoryAdapter(), p, TODAY);
    expect(a).toEqual(b);
    expect(a.productsCompared).toBe(11); // 7 backpacks + 4 raincoats
    expect(a.shopsCompared).toBe(4); // minhan, kidzone, bago, homie
  });
});
