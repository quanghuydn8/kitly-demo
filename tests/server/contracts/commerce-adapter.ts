// CommerceAdapter contract suite: the SAME tests run against InMemoryAdapter (fixtures) and SupabaseAdapter (seeded
// database). Only dataset-independent facts are asserted (planted products exist in both).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommerceAdapter, KitPlan, PlanItem } from "@/contract";
import { GUEST_PERSONA, PersonaSchema, ProductSchema, ShopSchema, VoucherSchema } from "@/contract";

export interface AdapterHarness {
  make(): CommerceAdapter;
  /** Removes intent sessions created by the suite (query starts with the marker). */
  cleanup?(marker: string): Promise<void>;
}

const plan = (event: KitPlan["event"] = "other"): KitPlan => ({
  event,
  language: "en",
  budget: null,
  deadline: null,
  items: [],
  assumptions: [],
});
const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  key: "dog",
  needLabel: "Dog food",
  category: null,
  required: true,
  quantity: 1,
  mustHaveTags: [],
  niceToHaveTags: [],
  maxUnitPrice: null,
  ...over,
});

export function commerceAdapterContract(name: string, h: AdapterHarness, opts: { skip?: boolean } = {}): void {
  describe.skipIf(!!opts.skip)(`CommerceAdapter contract: ${name}`, () => {
    const marker = `__contract_test__ ${Math.random().toString(36).slice(2)}`;
    let adapter: CommerceAdapter;
    beforeAll(() => {
      adapter = h.make();
    });
    afterAll(async () => {
      await h.cleanup?.(marker);
    });

    it("listShops returns valid shops incl. the mandatory ones", async () => {
      const shops = ShopSchema.array().parse(await adapter.listShops());
      const ids = shops.map((s) => s.id);
      for (const id of ["shop-minhan", "shop-kidzone", "shop-bago", "shop-homie", "shop-trailhead", "shop-deskpro"])
        expect(ids).toContain(id);
      expect(shops.find((s) => s.id === "shop-kidzone")?.tier).toBe("mall");
    });

    it("getProduct returns the planted hero exactly, null for an unknown id", async () => {
      const hero = ProductSchema.parse(await adapter.getProduct("prod-minhan-backpack"));
      expect(hero).toMatchObject({
        shopId: "shop-minhan",
        title: "Minh An Kids Backpack New Model 2026",
        category: "school-backpack",
        price: 349000,
        rating: 4.8,
        tags: ["kids"],
        attributes: { material: "polyester" },
        shipDaysMin: 1,
        shipDaysMax: 2,
      });
      expect(await adapter.getProduct("prod-does-not-exist")).toBeNull();
    });

    it("searchProducts: categories[] in one query, category, tagsAny, maxPrice, text, limit", async () => {
      const both = ProductSchema.array().parse(
        await adapter.searchProducts({ categories: ["school-backpack", "water-bottle"] }),
      );
      expect(new Set(both.map((p) => p.category))).toEqual(new Set(["school-backpack", "water-bottle"]));
      expect(both.filter((p) => p.category === "school-backpack").length).toBe(7);

      const bottles = await adapter.searchProducts({ category: "water-bottle" });
      expect(bottles.length).toBeGreaterThanOrEqual(2);
      expect(bottles.every((p) => p.category === "water-bottle")).toBe(true);

      expect((await adapter.searchProducts({ tagsAny: ["anti-hunchback"] })).map((p) => p.id)).toEqual([
        "prod-kidzone-ergo-backpack",
      ]);
      const anyOf = await adapter.searchProducts({ category: "school-backpack", tagsAny: ["grade-1", "lightweight"] });
      expect(anyOf.map((p) => p.id).sort()).toEqual(
        ["prod-homie-kids-backpack", "prod-kidzone-ergo-backpack", "prod-kidzone-lite-backpack"].sort(),
      );

      const cheap = await adapter.searchProducts({ category: "school-backpack", maxPrice: 200000 });
      expect(cheap.map((p) => p.id).sort()).toEqual(["prod-bago-backpack-basic", "prod-bago-backpack-color"]);

      const spine = (await adapter.searchProducts({ text: "SPINE" })).map((p) => p.id);
      expect(spine).toEqual(expect.arrayContaining(["prod-kidzone-ergo-backpack", "prod-minhan-backpack"]));

      expect(await adapter.searchProducts({ limit: 3 })).toHaveLength(3);
    });

    it("listVouchers: lan = 8 public + 2 wallet, guest/undefined = 8 public", async () => {
      const lan = VoucherSchema.array().parse(await adapter.listVouchers("lan"));
      expect(lan).toHaveLength(10);
      expect(
        lan
          .filter((v) => v.ownerPersona === "lan")
          .map((v) => v.code)
          .sort(),
      ).toEqual(["LAN-BTS10", "LAN-KZ80"]);
      const guest = await adapter.listVouchers("guest");
      expect(guest).toHaveLength(8);
      expect(guest.every((v) => v.ownerPersona === null)).toBe(true);
      expect(await adapter.listVouchers()).toHaveLength(8);
    });

    it("getPersona: lan from storage, guest constant", async () => {
      const lan = PersonaSchema.parse(await adapter.getPersona("lan"));
      expect(lan).toMatchObject({ id: "lan", name: "Lan", address: { district: "Cau Giay", city: "Hanoi" } });
      expect(lan.favoriteShopIds).toEqual(["shop-kidzone"]);
      expect(lan.cart.map((c) => c.productId)).toEqual(["prod-kidzone-lite-backpack"]);
      expect(await adapter.getPersona("guest")).toEqual(GUEST_PERSONA);
    });

    it("recordIntent + recordDemandItems → demandItemsSince and recentDemandItems (live only, newest first, DEMO_TODAY)", async () => {
      const { sessionId } = await adapter.recordIntent({ query: marker, plan: plan(), source: "live" });
      await adapter.recordDemandItems(sessionId, [
        { item: item(), matchedCount: 0, budgetHint: null },
        {
          item: item({ key: "lamp", needLabel: "Lamp", category: "kids-desk-lamp", mustHaveTags: ["anti-blue-light"] }),
          matchedCount: 0,
          budgetHint: 300000,
        },
      ]);
      const { sessionId: seedSession } = await adapter.recordIntent({ query: marker, plan: plan(), source: "seed" });
      await adapter.recordDemandItems(seedSession, [
        { item: item({ needLabel: "Seed only" }), matchedCount: 0, budgetHint: null },
      ]);

      const recent = await adapter.recentDemandItems(5);
      expect(recent.every((r) => r.source === "live")).toBe(true);
      expect(recent.some((r) => r.needLabel === "Seed only")).toBe(false);
      const mine = recent.filter((r) => r.sessionId === sessionId);
      expect(mine.map((r) => r.needLabel).sort()).toEqual(["Dog food", "Lamp"]);
      expect(mine.find((r) => r.needLabel === "Lamp")).toMatchObject({
        event: "other",
        category: "kids-desk-lamp",
        tags: ["anti-blue-light"],
        matchedCount: 0,
        budgetHint: 300000,
      });
      expect(mine[0].createdAt.slice(0, 10)).toBe("2026-09-02");
      const times = recent.map((r) => r.createdAt);
      expect([...times].sort().reverse()).toEqual(times);

      const since = await adapter.demandItemsSince("2026-08-26T00:00:00.000Z");
      expect(since.filter((r) => r.sessionId === sessionId)).toHaveLength(2);
      expect(since.every((r) => r.createdAt >= "2026-08-26T00:00:00.000Z")).toBe(true);
      const lamps = await adapter.demandItemsSince("2026-08-01T00:00:00.000Z", { category: "kids-desk-lamp" });
      expect(lamps.length).toBeGreaterThan(0);
      expect(lamps.every((r) => r.category === "kids-desk-lamp")).toBe(true);
    });

    it("recordDemandItems on an unknown session rejects", async () => {
      await expect(
        adapter.recordDemandItems("00000000-0000-4000-8000-0000000000ff", [
          { item: item(), matchedCount: 0, budgetHint: null },
        ]),
      ).rejects.toThrow();
    });

    it("updateListing snapshots (sets updatedForDemandAt); undoListing restores exactly; nothing left → null", async () => {
      const id = "prod-kidzone-lite-backpack";
      const before = await adapter.getProduct(id);
      const updated = await adapter.updateListing(id, {
        title: before!.title + " · Contract",
        description: before!.description + " Contract test.",
        tags: [...before!.tags, "waterproof"],
        attributes: { ...before!.attributes, test: "yes" },
      });
      expect(updated.tags).toContain("waterproof");
      expect(updated.updatedForDemandAt?.slice(0, 10)).toBe("2026-09-02");
      expect(await adapter.getProduct(id)).toEqual(updated);
      expect(await adapter.undoListing(id)).toEqual(before);
      expect(await adapter.getProduct(id)).toEqual(before);
      expect(await adapter.undoListing(id)).toBeNull();
    });
  });
}
