import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { getAdapter } from "@/server/adapter";
import { GUEST_PERSONA } from "@/contract";

let adapter: InMemoryAdapter;
beforeEach(() => {
  adapter = new InMemoryAdapter();
});

describe("InMemoryAdapter", () => {
  it("listVouchers: lan gets the 8 public + her 2 wallet vouchers, guest only the 8 public", async () => {
    const lan = await adapter.listVouchers("lan");
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

  it("updateListing snapshots and undoListing restores the exact previous listing", async () => {
    const before = await adapter.getProduct("prod-minhan-backpack");
    const updated = await adapter.updateListing("prod-minhan-backpack", {
      title: "Minh An Kids Backpack New Model 2026 · Anti-hunchback",
      description: before!.description + " Anti-hunchback design.",
      tags: ["kids", "anti-hunchback"],
      attributes: { material: "polyester", weight: "0.75 kg" },
    });
    expect(updated.tags).toEqual(["kids", "anti-hunchback"]);
    expect((await adapter.getProduct("prod-minhan-backpack"))?.title).toBe(updated.title);

    const restored = await adapter.undoListing("prod-minhan-backpack");
    expect(restored).toEqual(before);
    expect(await adapter.getProduct("prod-minhan-backpack")).toEqual(before);
    expect(await adapter.undoListing("prod-minhan-backpack")).toBeNull();
  });

  it("instances do not share state (each test starts from the fixtures)", async () => {
    await adapter.updateListing("prod-minhan-backpack", { title: "X", description: "Y", tags: [], attributes: {} });
    expect((await new InMemoryAdapter().getProduct("prod-minhan-backpack"))?.title).toBe(
      "Minh An Kids Backpack New Model 2026",
    );
  });

  it("searchProducts filters by categories[], category, text, tagsAny, maxPrice and limit", async () => {
    const both = await adapter.searchProducts({ categories: ["school-backpack", "water-bottle"] });
    expect(new Set(both.map((p) => p.category))).toEqual(new Set(["school-backpack", "water-bottle"]));
    expect(both).toHaveLength(9);
    expect((await adapter.searchProducts({ category: "water-bottle" })).length).toBe(2);
    expect((await adapter.searchProducts({ text: "spine" })).map((p) => p.id).sort()).toEqual([
      "prod-kidzone-ergo-backpack",
      "prod-minhan-backpack",
    ]);
    expect((await adapter.searchProducts({ tagsAny: ["anti-hunchback"] })).map((p) => p.id)).toEqual([
      "prod-kidzone-ergo-backpack",
    ]);
    const cheap = await adapter.searchProducts({ category: "school-backpack", maxPrice: 200000 });
    expect(cheap.every((p) => p.price <= 200000)).toBe(true);
    expect(cheap).toHaveLength(2);
    expect(await adapter.searchProducts({ limit: 3 })).toHaveLength(3);
  });

  it("getPersona: lan from fixtures, guest constant", async () => {
    expect((await adapter.getPersona("lan")).cart[0].productId).toBe("prod-kidzone-lite-backpack");
    expect(await adapter.getPersona("guest")).toEqual(GUEST_PERSONA);
  });

  it("recordIntent + recordDemandItems show up in demandItemsSince and recentDemandItems (live, newest first)", async () => {
    const plan = {
      event: "other" as const,
      language: "en" as const,
      budget: null,
      deadline: null,
      items: [],
      assumptions: [],
    };
    const item = {
      key: "dog",
      needLabel: "Dog food",
      category: null,
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    };
    const { sessionId } = await adapter.recordIntent({ query: "puppy", plan, source: "live" });
    await adapter.recordDemandItems(sessionId, [{ item, matchedCount: 0, budgetHint: null }]);

    const recent = await adapter.recentDemandItems(5);
    expect(recent[0]).toMatchObject({ sessionId, needLabel: "Dog food", source: "live", event: "other" });
    expect(recent.every((r) => r.source === "live")).toBe(true);
    const times = recent.map((r) => r.createdAt);
    expect([...times].sort().reverse()).toEqual(times);

    const since = await adapter.demandItemsSince("2026-08-26T00:00:00.000Z");
    expect(since.some((r) => r.sessionId === sessionId)).toBe(true);
    expect(since.every((r) => r.createdAt >= "2026-08-26T00:00:00.000Z")).toBe(true);
    const backpacks = await adapter.demandItemsSince("2026-08-01T00:00:00.000Z", { category: "school-backpack" });
    expect(backpacks.length).toBeGreaterThan(0);
    expect(backpacks.every((r) => r.category === "school-backpack")).toBe(true);
  });

  it("live sessions are timestamped on DEMO_TODAY", async () => {
    const plan = {
      event: "other" as const,
      language: "en" as const,
      budget: null,
      deadline: null,
      items: [],
      assumptions: [],
    };
    const item = {
      key: "x",
      needLabel: "X",
      category: null,
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    };
    const { sessionId } = await adapter.recordIntent({ query: "x", plan, source: "live" });
    await adapter.recordDemandItems(sessionId, [{ item, matchedCount: 0, budgetHint: null }]);
    expect((await adapter.recentDemandItems(1))[0].createdAt.slice(0, 10)).toBe("2026-09-02");
  });

  it("getAdapter() returns the in-memory adapter when KITLY_ADAPTER=memory", () => {
    expect(getAdapter()).toBeInstanceOf(InMemoryAdapter);
  });
});
