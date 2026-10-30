import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CATEGORIES, PersonaSchema, ProductSchema, ShopSchema, VoucherSchema, type Product } from "@/contract";
import { FakeLLM } from "@/server/llm";
import { buildWorld, LLM_CATEGORIES, type World } from "@/server/seed/world";
import { SHOP_CATEGORIES } from "@/server/seed/shops";
import { depthProblems } from "@/server/seed/depth";
import { expectPlantedFacts } from "./seed-planted-facts";

// Memory run on a small generated sample (FakeLLM, no network). The same planted-fact checks run against Supabase
// after `npm run seed` in supabase-adapter.test.ts.
const SAMPLE = ["notebooks", "desk-fan", "kids-desk-lamp", "tent"];

/** What the fast model returns for one category: 6 products, sometimes with forbidden tags / bad numbers. */
function llmOutput(category: string) {
  const base = { notebooks: 12000, "desk-fan": 250000, "kids-desk-lamp": 200000, tent: 900000 }[category] ?? 100000;
  const tiers = ["budget", "budget", "mid", "mid", "premium", "premium"] as const;
  return {
    products: tiers.map((tier, i) => ({
      title: `Sample ${category} ${tier} ${i}`,
      description: `A ${tier} ${category}. 30 x 20 cm, 0.5 kg.`,
      tier,
      price: base * (1 + i * 0.12) + 123, // narrow spread + not rounded
      rating: i === 5 ? 5.4 : 4.2,
      reviewCount: 120,
      soldCount: 400,
      stock: i === 1 ? 0 : 80,
      shipDaysMin: 4,
      shipDaysMax: i < 2 ? 3 : 7, // mostly slow: the depth rule must fix it
      tags: i === 0 ? ["anti-blue-light", "backpack-cover", "anti-hunchback", "compact"] : ["compact"],
      attributes: [{ name: "size", value: "M" }],
    })),
  };
}

let cacheDir: string;
let fake: FakeLLM;
let world: World;
beforeAll(async () => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "kitly-seed-"));
  fake = new FakeLLM({ structured: SAMPLE.map(llmOutput) });
  world = await buildWorld({ llm: fake, today: "2026-09-02", categories: SAMPLE, cacheDir });
});

describe("buildWorld: shops (DATA.md §2)", () => {
  it("25 shops: 6 mall / 8 preferred / 11 regular, fees 15–35k, 3 cities, mandatory shops", () => {
    const shops = ShopSchema.array().parse(world.shops);
    expect(shops).toHaveLength(25);
    const tiers = (t: string) => shops.filter((s) => s.tier === t).length;
    expect([tiers("mall"), tiers("preferred"), tiers("regular")]).toEqual([6, 8, 11]);
    expect(shops.every((s) => s.shipFee >= 15000 && s.shipFee <= 35000)).toBe(true);
    expect(new Set(shops.map((s) => s.city))).toEqual(new Set(["Hanoi", "HCMC", "Da Nang"]));
    const byId = new Map(shops.map((s) => [s.id, s]));
    expect(
      [
        ["shop-minhan", "Minh An Stationery", "preferred"],
        ["shop-kidzone", "KidZone Mall", "mall"],
        ["shop-bago", "Bago Bags", "regular"],
        ["shop-homie", "Homie Living", "preferred"],
        ["shop-trailhead", "Trailhead Outdoor", "mall"],
        ["shop-deskpro", "DeskPro", "preferred"],
        ["shop-tetxinh", "Tet Xinh Gifts", "regular"],
      ].map(([id]) => [id, byId.get(id)?.name, byId.get(id)?.tier]),
    ).toEqual([
      ["shop-minhan", "Minh An Stationery", "preferred"],
      ["shop-kidzone", "KidZone Mall", "mall"],
      ["shop-bago", "Bago Bags", "regular"],
      ["shop-homie", "Homie Living", "preferred"],
      ["shop-trailhead", "Trailhead Outdoor", "mall"],
      ["shop-deskpro", "DeskPro", "preferred"],
      ["shop-tetxinh", "Tet Xinh Gifts", "regular"],
    ]);
  });

  it("every category has ≥ 3 shops; each event has 2 shops carrying 6+ of its categories; Minh An carries 8", () => {
    for (const c of CATEGORIES) {
      const carriers = Object.entries(SHOP_CATEGORIES).filter(([, cats]) => cats.includes(c.id));
      expect(carriers.length, c.id).toBeGreaterThanOrEqual(3);
    }
    for (const event of new Set(CATEGORIES.map((c) => c.event))) {
      const ids = new Set(CATEGORIES.filter((c) => c.event === event).map((c) => c.id));
      const multi = Object.values(SHOP_CATEGORIES).filter((cats) => cats.filter((c) => ids.has(c)).length >= 6);
      expect(multi.length, event).toBeGreaterThanOrEqual(2);
    }
    const bts = new Set(CATEGORIES.filter((c) => c.event === "back_to_school").map((c) => c.id));
    expect(SHOP_CATEGORIES["shop-minhan"].filter((c) => bts.has(c))).toHaveLength(8);
    expect(Object.keys(SHOP_CATEGORIES).sort()).toEqual(world.shops.map((s) => s.id).sort());
  });
});

describe("buildWorld: catalog generation", () => {
  it("one fast-model call per LLM category, with the json schema name and fast effort", () => {
    expect(fake.calls).toHaveLength(SAMPLE.length);
    expect(fake.calls.every((c) => c.kind === "structured" && c.effort === "low" && c.model === "gpt-6-luna")).toBe(
      true,
    );
    expect(LLM_CATEGORIES).not.toContain("school-backpack");
    expect(LLM_CATEGORIES).not.toContain("kids-raincoat");
    expect(LLM_CATEGORIES).toHaveLength(58);
    const prompt = fake.calls.find((c) => c.messages.some((m) => m.content.includes("desk-fan")))!;
    expect(prompt.messages.map((m) => m.content).join("\n")).toMatch(/2 budget.*2 mid.*2 premium/s);
  });

  it("re-runs read the cache: zero LLM calls", async () => {
    const again = new FakeLLM();
    const w2 = await buildWorld({ llm: again, today: "2026-09-02", categories: SAMPLE, cacheDir });
    expect(again.calls).toHaveLength(0);
    expect(w2.products.map((p) => p.id)).toEqual(world.products.map((p) => p.id));
  });

  it("products are valid, clamped and only carry canonical non-gap tags", () => {
    const products = ProductSchema.array().parse(world.products);
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    const shopIds = new Set(world.shops.map((s) => s.id));
    for (const p of products) {
      expect(shopIds.has(p.shopId), p.id).toBe(true);
      expect(p.price % 1000, p.id).toBe(0);
      expect(p.rating).toBeGreaterThanOrEqual(3.8);
      expect(p.rating).toBeLessThanOrEqual(5);
      expect(p.shipDaysMin).toBeLessThanOrEqual(p.shipDaysMax);
      expect(SHOP_CATEGORIES[p.shopId], `${p.id} sold by a shop that carries ${p.category}`).toContain(p.category);
    }
  });

  it("depth rule + express rule hold for every LLM category; each spread over ≥ 3 shops", () => {
    for (const c of SAMPLE) {
      const ps = world.products.filter((p) => p.category === c);
      expect(depthProblems(ps, world.shops), c).toEqual([]);
      expect(new Set(ps.map((p) => p.shopId)).size, c).toBeGreaterThanOrEqual(3);
      expect(ps.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("a failed LLM category still gets a deep, code-written assortment", async () => {
    const broken = new FakeLLM({ structured: [new Error("proxy 502")] });
    const w = await buildWorld({ llm: broken, today: "2026-09-02", categories: ["mouse"], cacheDir: null });
    expect(
      depthProblems(
        w.products.filter((p) => p.category === "mouse"),
        w.shops,
      ),
    ).toEqual([]);
  });
});

describe("buildWorld: planted facts (DATA.md §4, §7)", () => {
  it("planted products, gaps, persona and vouchers", () => {
    expectPlantedFacts(
      {
        products: ProductSchema.array().parse(world.products),
        vouchers: VoucherSchema.array().parse(world.vouchers),
        persona: PersonaSchema.parse(world.personas[0]),
        shops: world.shops,
      },
      "2026-09-02",
    );
  });

  it("other backpacks: 3 cheap untagged slow Bago bags, one 420k mid-range outside KidZone, 4 plain raincoats", () => {
    const bp = world.products.filter((p) => p.category === "school-backpack");
    const bago = bp.filter((p) => p.shopId === "shop-bago");
    expect(bago).toHaveLength(3);
    expect(bago.every((p) => p.tags.length === 0 && p.price >= 150000 && p.price <= 250000)).toBe(true);
    expect(bago.every((p) => p.shipDaysMin >= 6 && p.shipDaysMax <= 9)).toBe(true);
    const mid = bp.filter((p) => p.price === 420000);
    expect(mid).toHaveLength(1);
    expect(mid[0]).toMatchObject({ tags: ["kids", "lightweight"], shipDaysMin: 2, shipDaysMax: 3 });
    expect(mid[0].shopId).not.toBe("shop-kidzone");
    const rain = world.products.filter((p) => p.category === "kids-raincoat");
    expect(rain).toHaveLength(4);
  });

  it("closest before enrichment: relaxing anti-hunchback (≤ 400k, arrives by Sep 5) leaves only the Minh An backpack", () => {
    const fits = (p: Product) =>
      p.category === "school-backpack" && p.stock > 0 && p.price <= 400000 && p.shipDaysMax <= 3;
    expect(world.products.filter(fits).map((p) => p.id)).toEqual(["prod-minhan-backpack"]);
  });

  it("dates follow DEMO_TODAY (fallback 2026-08-20)", async () => {
    const w = await buildWorld({ llm: new FakeLLM(), today: "2026-08-20", categories: SAMPLE, cacheDir });
    expect(w.vouchers.find((v) => v.code === "LAN-BTS10")!.validUntil).toBe("2026-08-22");
    expect(w.vouchers.find((v) => v.code === "LAN-KZ80")!.validUntil).toBe("2026-09-17");
    expect(w.personas[0].cart[0].addedAt.slice(0, 10)).toBe("2026-08-06");
  });
});

describe("buildWorld: demand", () => {
  it("demand is generated against the seeded catalog: hero need matches exactly one product", () => {
    const hero = world.sessions.flatMap((s) => s.items).find((i) => i.tags[0] === "anti-hunchback")!;
    expect(hero.matchedCount).toBe(1);
    expect(world.sessions.length).toBeGreaterThan(300);
  });
});
