import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ShopSchema,
  ProductSchema,
  VoucherSchema,
  DemandItemRowSchema,
  KitSseEventSchema,
  CATEGORIES,
  CANONICAL_TAGS,
  gapKeyFor,
} from "@/contract";
import { fixtures, kitSample } from "@/contract/fixtures";

describe("contract fixtures", () => {
  it("every fixture record parses with its zod schema", () => {
    expect(z.array(ShopSchema).parse(fixtures.shops)).toHaveLength(6);
    expect(z.array(ProductSchema).parse(fixtures.products).length).toBeGreaterThanOrEqual(25);
    expect(z.array(VoucherSchema).parse(fixtures.vouchers)).toHaveLength(5);
    expect(z.array(DemandItemRowSchema).parse(fixtures.demandItems).length).toBeGreaterThanOrEqual(50);
  });

  it("contains the hero listing-gap backpack exactly as DATA.md §4", () => {
    const hero = fixtures.products.find((p) => p.id === "prod-minhan-backpack");
    expect(hero).toEqual({
      id: "prod-minhan-backpack",
      shopId: "shop-minhan",
      title: "Minh An Kids Backpack New Model 2026",
      category: "school-backpack",
      description:
        "Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only 0.75 kg. Water-resistant fabric. Sized for children aged 6–8.",
      price: 349000,
      rating: 4.8,
      reviewCount: 412,
      soldCount: 1930,
      stock: 120,
      tags: ["kids"],
      attributes: { material: "polyester" },
      shipDaysMin: 2,
      shipDaysMax: 3,
      updatedForDemandAt: null,
    });
  });

  it("only one product carries anti-hunchback and none carries backpack-cover", () => {
    const anti = fixtures.products.filter((p) => p.tags.includes("anti-hunchback"));
    expect(anti.map((p) => p.shopId)).toEqual(["shop-kidzone"]);
    expect(fixtures.products.some((p) => p.tags.includes("backpack-cover"))).toBe(false);
  });

  it("products only use taxonomy categories, canonical tags and existing shops", () => {
    const catIds = new Set(CATEGORIES.map((c) => c.id));
    const shopIds = new Set(fixtures.shops.map((s) => s.id));
    for (const p of fixtures.products) {
      expect(catIds.has(p.category), p.id).toBe(true);
      expect(shopIds.has(p.shopId), p.id).toBe(true);
      for (const t of p.tags) expect(CANONICAL_TAGS as readonly string[]).toContain(t);
    }
  });

  it("taxonomy has 60 categories", () => {
    expect(CATEGORIES).toHaveLength(60);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(60);
  });

  it("kit.sample.json is a valid SSE stream in contract order ending with done", () => {
    const events = z.array(KitSseEventSchema).parse(kitSample);
    const names = events.map((e) => e.event);
    expect(names.at(-1)).toBe("done");
    const order = ["plan", "options", "explanation", "done"].map((n) => names.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(names[0]).toBe("step");
  });
});

describe("gapKeyFor", () => {
  it("builds `${category ?? \"none\"}|${sorted unique tags}` — the key insights and Notify me share", () => {
    expect(gapKeyFor("school-backpack", ["anti-hunchback"])).toBe("school-backpack|anti-hunchback");
    expect(gapKeyFor("kids-raincoat", ["grade-1", "backpack-cover", "grade-1"])).toBe(
      "kids-raincoat|backpack-cover,grade-1",
    );
    expect(gapKeyFor(null, ["dog"])).toBe("none|dog");
    expect(gapKeyFor(null, [])).toBe("none|");
  });
});
