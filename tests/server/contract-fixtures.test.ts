import { describe, expect, it } from "vitest";
import {
  BasketOptionSchema,
  DemandItemRowSchema,
  KitStreamSchema,
  PersonaSchema,
  ProductSchema,
  ShopSchema,
  ThreadsSampleSchema,
  VoucherSchema,
  CATEGORIES,
  type BasketOption,
  type KitStreamEvent,
} from "@/contract";
import shops from "@/contract/fixtures/shops.json";
import products from "@/contract/fixtures/products.json";
import vouchers from "@/contract/fixtures/vouchers.json";
import personas from "@/contract/fixtures/personas.json";
import kitSample from "@/contract/fixtures/kit.sample.json";
import kitClarify from "@/contract/fixtures/kit.clarify.sample.json";
import kitAnswer from "@/contract/fixtures/kit.answer.sample.json";
import threadsSample from "@/contract/fixtures/threads.sample.json";
import overBudget from "@/contract/fixtures/option.over-budget.json";

const optionsOf = (stream: KitStreamEvent[]): BasketOption[] => {
  const e = stream.find((x) => x.event === "options");
  if (e?.event !== "options") throw new Error("no options event");
  return e.data.options;
};

describe("contract fixtures parse with the zod schemas", () => {
  it("catalog fixtures", () => {
    expect(ShopSchema.array().parse(shops)).toHaveLength(6);
    const ps = ProductSchema.array().parse(products);
    expect(ps.length).toBeGreaterThanOrEqual(30);
    VoucherSchema.array().parse(vouchers);
    PersonaSchema.array().parse(personas);
  });

  it("every product category is in the taxonomy (60 categories)", () => {
    expect(CATEGORIES).toHaveLength(60);
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const p of products) expect(ids.has(p.category), p.id).toBe(true);
  });

  it("recorded SSE streams", () => {
    for (const s of [kitSample, kitClarify, kitAnswer]) KitStreamSchema.parse(s);
    ThreadsSampleSchema.parse(threadsSample);
    BasketOptionSchema.parse(overBudget);
  });
});

describe("planted demo facts in the fixtures", () => {
  it("prod-minhan-backpack exactly as DATA.md §4", () => {
    const p = products.find((x) => x.id === "prod-minhan-backpack");
    expect(p).toEqual({
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
      shipDaysMin: 1,
      shipDaysMax: 2,
      updatedForDemandAt: null,
    });
  });

  it("prod-kidzone-lite-backpack and persona lan as DATA.md §7", () => {
    const lite = products.find((x) => x.id === "prod-kidzone-lite-backpack");
    expect(lite).toMatchObject({
      shopId: "shop-kidzone",
      price: 520000,
      rating: 4.9,
      reviewCount: 860,
      soldCount: 2400,
      stock: 40,
    });
    expect(lite?.tags).toEqual(["kids", "lightweight", "grade-1"]);
    expect(lite?.attributes).toEqual({ weight: "0.6 kg", age: "6-9" });
    expect(personas).toEqual([
      {
        id: "lan",
        name: "Lan",
        address: { district: "Cau Giay", city: "Hanoi" },
        favoriteShopIds: ["shop-kidzone"],
        cart: [{ productId: "prod-kidzone-lite-backpack", addedAt: expect.stringMatching(/^2026-08-19/) }],
      },
    ]);
    const wallet = vouchers.filter((v) => v.ownerPersona === "lan").map((v) => [v.code, v.validUntil]);
    expect(wallet).toEqual([
      ["LAN-KZ80", "2026-09-30"],
      ["LAN-BTS10", "2026-09-04"],
    ]);
  });

  it("exactly one anti-hunchback product and no backpack-cover / anti-blue-light", () => {
    expect(products.filter((p) => p.tags.includes("anti-hunchback")).map((p) => p.id)).toEqual([
      "prod-kidzone-ergo-backpack",
    ]);
    expect(products.some((p) => p.tags.includes("backpack-cover") || p.tags.includes("anti-blue-light"))).toBe(false);
  });

  it("kit.sample.json is a Lan hero run ending with done", () => {
    const stream = KitStreamSchema.parse(kitSample);
    expect(stream.at(-1)?.event).toBe("done");
    expect(stream.at(-2)?.event).toBe("followup");
    const names = stream.map((e) => e.event);
    expect(names.indexOf("plan")).toBeLessThan(names.indexOf("options"));
    expect(names.indexOf("options")).toBeLessThan(names.indexOf("explanation"));

    const options = optionsOf(stream);
    expect(options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
    for (const o of options) {
      expect(o.grandTotal).toBeLessThanOrEqual(1_500_000);
      expect(o.savings.reduce((s, x) => s + x.amount, 0)).toBe(o.discountTotal);
      expect(o.grandTotal).toBe(o.itemsTotal + o.shippingTotal - o.discountTotal);
      const backpack = o.noMatch.find((n) => n.itemKey === "backpack");
      expect(backpack?.closest?.candidate.product.id).toBe("prod-minhan-backpack");
      expect(backpack?.closest?.missingTags).toEqual(["anti-hunchback"]);
    }
    const balanced = options[1];
    expect(balanced.savings.some((s) => s.wallet && s.label.startsWith("Your wallet voucher"))).toBe(true);
    expect(balanced.interests).toEqual([
      expect.objectContaining({
        itemKey: "backpack",
        walletVoucherCode: "LAN-KZ80",
        priceAfterVoucher: 440000,
        overMaxPriceBy: 40000,
        missingTags: ["anti-hunchback"],
      }),
    ]);
    expect(balanced.interests?.[0].candidate.product.id).toBe("prod-kidzone-lite-backpack");
  });

  it("clarify and answer samples", () => {
    const clarify = KitStreamSchema.parse(kitClarify);
    expect(clarify.map((e) => e.event).slice(-2)).toEqual(["clarify", "done"]);
    const answer = KitStreamSchema.parse(kitAnswer);
    expect(answer.at(-1)).toMatchObject({ event: "done", data: { sessionId: null, answered: true } });
  });

  it("threads sample: 2 threads, one refined with a diff + message, one awaiting_budget", () => {
    const threads = ThreadsSampleSchema.parse(threadsSample);
    expect(threads).toHaveLength(2);
    expect(threads[0].versions.map((v) => v.version)).toEqual([1, 2]);
    expect(threads[0].versions[1].diff?.removed).toEqual(["uniform"]);
    expect(threads[0].messages).toHaveLength(1);
    expect(threads[1].versions[0]).toMatchObject({ status: "awaiting_budget", options: [] });
  });

  it("over-budget option has overBy and two fit suggestions", () => {
    const o = BasketOptionSchema.parse(overBudget);
    expect(o.status).toBe("over_budget");
    expect(o.overBy).toBeGreaterThan(0);
    expect(o.fit).toHaveLength(2);
  });

  it("demand fixture rows are valid DemandItemRows once flattened", async () => {
    const { default: demand } = await import("@/contract/fixtures/demand.json");
    const rows = demand.flatMap((s) =>
      s.items.map((i) => ({ sessionId: s.id, createdAt: s.createdAt, event: s.event, ...i })),
    );
    expect(rows.length).toBeGreaterThanOrEqual(60);
    DemandItemRowSchema.array().parse(rows);
  });
});
