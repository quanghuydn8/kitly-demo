// Shared CommerceAdapter contract suite (ticket 01 Full): the same tests run against every implementation.
// Relies only on planted facts present in both the fixtures and the seeded database (DATA.md §4).
import { afterAll, describe, expect, it } from "vitest";
import {
  DemandItemRowSchema,
  ProductSchema,
  ShopSchema,
  VoucherSchema,
  type CommerceAdapter,
  type KitPlan,
} from "@/contract";
import { today } from "@/server/today";

const HERO = "prod-minhan-backpack";
export const CONTRACT_QUERY_PREFIX = "__contract_test__";

export function runAdapterContract(
  name: string,
  make: () => CommerceAdapter,
  opts: { cleanup?: () => Promise<void> } = {},
) {
  describe(`CommerceAdapter contract: ${name}`, () => {
    const a = make();
    if (opts.cleanup) afterAll(opts.cleanup);

    it("listShops returns valid shops incl. Minh An Stationery (preferred)", async () => {
      const shops = await a.listShops();
      shops.forEach((s) => ShopSchema.parse(s));
      expect(shops.find((s) => s.id === "shop-minhan")).toMatchObject({
        name: "Minh An Stationery",
        tier: "preferred",
      });
    });

    it("getProduct returns the planted hero listing, null for unknown ids", async () => {
      const p = await a.getProduct(HERO);
      ProductSchema.parse(p);
      expect(p).toMatchObject({
        shopId: "shop-minhan",
        price: 349000,
        rating: 4.8,
        tags: ["kids"],
        attributes: { material: "polyester" },
      });
      expect(await a.getProduct("no-such-product")).toBeNull();
    });

    it("searchProducts filters by category, price, tags, text and limit", async () => {
      const backpacks = await a.searchProducts({ category: "school-backpack", maxPrice: 400000 });
      backpacks.forEach((p) => ProductSchema.parse(p));
      expect(backpacks.every((p) => p.category === "school-backpack" && p.price <= 400000)).toBe(true);
      expect(backpacks.map((p) => p.id)).toContain(HERO);
      const anti = await a.searchProducts({ tagsAny: ["anti-hunchback", "backpack-cover"] });
      expect(anti.map((p) => p.id)).toEqual(["prod-kidzone-ergo-backpack"]);
      expect((await a.searchProducts({ text: "Spine-Care backpack" })).map((p) => p.id)).toContain(
        "prod-kidzone-ergo-backpack",
      );
      expect(await a.searchProducts({ text: "zzzz-nothing-matches" })).toEqual([]);
      expect(await a.searchProducts({ limit: 3 })).toHaveLength(3);
    });

    it("listVouchers includes MINHAN30 and the platform vouchers", async () => {
      const vs = await a.listVouchers();
      vs.forEach((v) => VoucherSchema.parse(v));
      expect(vs.find((v) => v.code === "MINHAN30")).toMatchObject({
        scope: "shop",
        shopId: "shop-minhan",
        kind: "fixed",
        value: 30000,
        minSpend: 300000,
      });
      expect(
        vs
          .filter((v) => v.scope === "platform")
          .map((v) => v.code)
          .sort(),
      ).toEqual(["FREESHIP", "KITLY50", "SAVE5"]);
    });

    it("recordIntent + recordDemandItems land on DEMO_TODAY and come back through demandItemsSince", async () => {
      const plan: KitPlan = {
        event: "other",
        language: "en",
        budget: null,
        deadline: null,
        items: [],
        assumptions: [],
      };
      const { sessionId } = await a.recordIntent({
        query: `${CONTRACT_QUERY_PREFIX} adopting a puppy`,
        plan,
        source: "live",
      });
      const item = {
        key: "food",
        needLabel: "Puppy food",
        category: null,
        required: true,
        quantity: 1,
        mustHaveTags: ["organic-cotton"],
        niceToHaveTags: [],
        maxUnitPrice: null,
      };
      const lamp = { ...item, key: "lamp", needLabel: "Lamp", category: "kids-desk-lamp", mustHaveTags: [] };
      await a.recordDemandItems(sessionId, [
        { item, matchedCount: 0, budgetHint: null },
        { item: lamp, matchedCount: 3, budgetHint: 250000 },
      ]);
      const since = `${today()}T00:00:00.000Z`;
      const mine = (await a.demandItemsSince(since)).filter((r) => r.sessionId === sessionId);
      mine.forEach((r) => DemandItemRowSchema.parse(r));
      expect(mine).toHaveLength(2);
      const food = mine.find((r) => r.needLabel === "Puppy food")!;
      expect(food).toMatchObject({
        event: "other",
        category: null,
        tags: ["organic-cotton"],
        matchedCount: 0,
        budgetHint: null,
      });
      expect(food.createdAt.startsWith(today())).toBe(true);
      expect(food.createdAt).toMatch(/Z$/);
      const lamps = (await a.demandItemsSince(since, { category: "kids-desk-lamp" })).filter(
        (r) => r.sessionId === sessionId,
      );
      expect(lamps.map((r) => r.needLabel)).toEqual(["Lamp"]);
      await expect(
        a.recordDemandItems("00000000-0000-4000-8000-00000000dead", [
          { item, matchedCount: 0, budgetHint: null },
        ]),
      ).rejects.toThrow();
    });

    it("updateListing snapshots; undoListing restores step by step, then null", async () => {
      const v0 = (await a.getProduct(HERO))!;
      try {
        const v1 = await a.updateListing(HERO, {
          title: `${v0.title} – Anti-Hunchback`,
          description: `${v0.description} Anti-hunchback design.`,
          tags: ["kids", "anti-hunchback"],
          attributes: { material: "polyester", weight: "0.75 kg" },
        });
        expect(v1.tags).toEqual(["kids", "anti-hunchback"]);
        expect(v1.attributes).toEqual({ material: "polyester", weight: "0.75 kg" });
        expect(v1.updatedForDemandAt?.startsWith(today())).toBe(true);
        expect((await a.searchProducts({ tagsAny: ["anti-hunchback"] })).map((p) => p.id)).toContain(HERO);
        await a.updateListing(HERO, { title: "v2", description: "d", tags: [], attributes: {} });
        expect(await a.undoListing(HERO)).toEqual(v1);
        expect(await a.undoListing(HERO)).toEqual(v0);
        expect(await a.getProduct(HERO)).toEqual(v0);
      } finally {
        while ((await a.undoListing(HERO)) !== null);
      }
      expect(await a.undoListing(HERO)).toBeNull();
      await expect(
        a.updateListing("no-such-product", { title: "x", description: "x", tags: [], attributes: {} }),
      ).rejects.toThrow();
    });
  });
}
