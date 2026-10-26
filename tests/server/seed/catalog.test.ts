import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANONICAL_TAGS, CATEGORIES, ProductSchema, ShopSchema, VoucherSchema } from "@/contract";
import { FakeLLM } from "@/server/llm";
import { generateCatalog, LLM_CATEGORIES, mapLimit } from "@/server/seed/catalog";
import { SEED_SHOPS, SEED_VOUCHERS, SHOP_CATEGORIES } from "@/server/seed/world";
import { buildTestCatalog, fakeCatalogLLM } from "./fake-catalog";

const HERO = "prod-minhan-backpack";

describe("seed world (DATA.md §2–3)", () => {
  it("has 25 shops: 6 mall, 8 preferred, 11 regular, ship fee 15k–35k, three cities", () => {
    expect(SEED_SHOPS).toHaveLength(25);
    SEED_SHOPS.forEach((s) => ShopSchema.parse(s));
    const tiers = SEED_SHOPS.reduce<Record<string, number>>(
      (m, s) => ({ ...m, [s.tier]: (m[s.tier] ?? 0) + 1 }),
      {},
    );
    expect(tiers).toEqual({ mall: 6, preferred: 8, regular: 11 });
    expect(SEED_SHOPS.every((s) => s.shipFee >= 15000 && s.shipFee <= 35000)).toBe(true);
    expect(new Set(SEED_SHOPS.map((s) => s.city))).toEqual(new Set(["Hanoi", "HCMC", "Da Nang"]));
    for (const id of [
      "shop-minhan",
      "shop-kidzone",
      "shop-bago",
      "shop-homie",
      "shop-trailhead",
      "shop-deskpro",
      "shop-tetxinh",
    ])
      expect(SEED_SHOPS.map((s) => s.id)).toContain(id);
    expect(SEED_SHOPS.find((s) => s.id === "shop-minhan")!.tier).toBe("preferred");
    expect(SEED_SHOPS.find((s) => s.id === "shop-kidzone")!.tier).toBe("mall");
  });

  it("each event has 2 shops carrying 6+ of its categories; Minh An carries 8 back-to-school categories", () => {
    const events = [...new Set(CATEGORIES.map((c) => c.event))];
    for (const ev of events) {
      const evCats = CATEGORIES.filter((c) => c.event === ev).map((c) => c.id);
      const multi = Object.entries(SHOP_CATEGORIES).filter(
        ([, cats]) => cats.filter((c) => evCats.includes(c)).length >= 6,
      );
      expect(multi.length, ev).toBeGreaterThanOrEqual(2);
    }
    const minhanB2s = SHOP_CATEGORIES["shop-minhan"].filter(
      (c) => CATEGORIES.find((x) => x.id === c)!.event === "back_to_school",
    );
    expect(minhanB2s).toHaveLength(8);
  });

  it("has 8 vouchers incl. KITLY50, FREESHIP, SAVE5, MINHAN30, KIDZONE10 (5 shop vouchers)", () => {
    expect(SEED_VOUCHERS).toHaveLength(8);
    SEED_VOUCHERS.forEach((v) => VoucherSchema.parse(v));
    expect(SEED_VOUCHERS.filter((v) => v.scope === "shop")).toHaveLength(5);
    const byCode = Object.fromEntries(SEED_VOUCHERS.map((v) => [v.code, v]));
    expect(byCode.MINHAN30).toMatchObject({
      shopId: "shop-minhan",
      kind: "fixed",
      value: 30000,
      minSpend: 300000,
    });
    expect(byCode.KIDZONE10).toMatchObject({
      kind: "percent",
      value: 10,
      maxDiscount: 50000,
      minSpend: 400000,
    });
    expect(byCode.KITLY50).toMatchObject({
      scope: "platform",
      kind: "fixed",
      value: 50000,
      minSpend: 1000000,
    });
    expect(byCode.FREESHIP).toMatchObject({
      scope: "platform",
      kind: "freeship",
      value: 30000,
      minSpend: 200000,
    });
    expect(byCode.SAVE5).toMatchObject({ kind: "percent", value: 5, maxDiscount: 40000, minSpend: 500000 });
    const shopIds = new Set(SEED_SHOPS.map((s) => s.id));
    expect(SEED_VOUCHERS.every((v) => v.shopId === null || shopIds.has(v.shopId))).toBe(true);
  });
});

describe("generateCatalog (FakeLLM, code overwrites planted facts)", () => {
  it("one LLM call per non-planted category, with a JSON schema, on the fast model", async () => {
    const llm = fakeCatalogLLM();
    await generateCatalog({ llm, model: "fake-fast", cacheDir: null });
    expect(llm.calls).toHaveLength(LLM_CATEGORIES.length);
    expect(llm.calls.every((c) => c.kind === "structured" && c.model === "fake-fast")).toBe(true);
    expect(LLM_CATEGORIES).not.toContain("school-backpack");
    expect(LLM_CATEGORIES).not.toContain("kids-raincoat");
    expect(LLM_CATEGORIES.length + 2).toBe(CATEGORIES.length);
  });

  it("~360 valid products, canonical tags only, every product's shop exists, ≥3 shops per category", async () => {
    const products = await buildTestCatalog();
    expect(products.length).toBeGreaterThanOrEqual(340);
    expect(products.length).toBeLessThanOrEqual(380);
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    const shopIds = new Set(SEED_SHOPS.map((s) => s.id));
    for (const p of products) {
      ProductSchema.parse(p);
      expect(shopIds.has(p.shopId), p.id).toBe(true);
      expect(
        p.tags.every((t) => (CANONICAL_TAGS as readonly string[]).includes(t)),
        p.id,
      ).toBe(true);
      expect(p.rating).toBeGreaterThanOrEqual(3.8);
      expect(p.rating).toBeLessThanOrEqual(5);
      expect(p.shipDaysMin).toBeGreaterThanOrEqual(1);
      expect(p.shipDaysMax).toBeLessThanOrEqual(9);
      expect(p.shipDaysMin).toBeLessThanOrEqual(p.shipDaysMax);
      expect(p.stock).toBeGreaterThanOrEqual(0);
      expect(p.stock).toBeLessThanOrEqual(500);
      expect(p.updatedForDemandAt).toBeNull();
      expect(SHOP_CATEGORIES[p.shopId], `${p.id} at ${p.shopId}`).toContain(p.category);
    }
    for (const c of CATEGORIES) {
      const shops = new Set(products.filter((p) => p.category === c.id).map((p) => p.shopId));
      expect(shops.size, c.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("planted facts are exact even when the LLM uses the gap tags (DATA.md §4)", async () => {
    const products = await buildTestCatalog();
    const hero = products.find((p) => p.id === HERO)!;
    expect(hero).toMatchObject({
      shopId: "shop-minhan",
      title: "Minh An Kids Backpack New Model 2026",
      category: "school-backpack",
      price: 349000,
      rating: 4.8,
      reviewCount: 412,
      soldCount: 1930,
      stock: 120,
      shipDaysMin: 2,
      shipDaysMax: 3,
      tags: ["kids"],
      attributes: { material: "polyester" },
    });
    expect(hero.description).toBe(
      "Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only 0.75 kg. Water-resistant fabric. Sized for children aged 6–8.",
    );
    const anti = products.filter((p) => p.tags.includes("anti-hunchback"));
    expect(anti.map((p) => p.id)).toEqual(["prod-kidzone-ergo-backpack"]);
    expect(anti[0]).toMatchObject({
      title: "KidZone Ergo Spine-Care Backpack",
      price: 890000,
      shopId: "shop-kidzone",
      shipDaysMin: 2,
      shipDaysMax: 4,
    });
    expect(products.filter((p) => p.tags.includes("backpack-cover"))).toHaveLength(0);
    expect(products.filter((p) => p.tags.includes("anti-blue-light"))).toHaveLength(0);

    const backpacks = products.filter((p) => p.category === "school-backpack");
    const bago = backpacks.filter((p) => p.shopId === "shop-bago");
    expect(bago).toHaveLength(3);
    expect(
      bago.every((p) => p.price >= 150000 && p.price <= 250000 && p.tags.length === 0 && p.shipDaysMin >= 6),
    ).toBe(true);
    const mid = backpacks.filter((p) => p.price >= 420000 && p.price <= 520000);
    expect(mid).toHaveLength(2);
    expect(mid.every((p) => p.tags.includes("kids") && p.tags.includes("lightweight"))).toBe(true);
    expect(backpacks).toHaveLength(7);

    const raincoats = products.filter((p) => p.category === "kids-raincoat");
    expect(raincoats).toHaveLength(4);
    expect(products.filter((p) => p.category === "kids-desk-lamp").length).toBeGreaterThanOrEqual(3);
  });

  it("caches raw LLM output per category so a re-run makes no LLM calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kitly-cache-"));
    const first = await generateCatalog({ llm: fakeCatalogLLM(), model: "fake-fast", cacheDir: dir });
    expect(readdirSync(dir)).toHaveLength(LLM_CATEGORIES.length);
    const empty = new FakeLLM(); // throws if called
    const second = await generateCatalog({ llm: empty, model: "fake-fast", cacheDir: dir });
    expect(empty.calls).toHaveLength(0);
    expect(second).toEqual(first);
  });
});

describe("mapLimit", () => {
  it("runs every task, keeps result order, never more than `limit` at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit(
      Array.from({ length: 30 }, (_, i) => i),
      8,
      async (n) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1 + (n % 3)));
        inFlight--;
        return n * 2;
      },
    );
    expect(out).toEqual(Array.from({ length: 30 }, (_, i) => i * 2));
    expect(peak).toBe(8);
  });
});
