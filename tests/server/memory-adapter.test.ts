import { describe, expect, it } from "vitest";
import { InMemoryAdapter } from "@/server/adapter/memory";
import { getAdapter } from "@/server/adapter";
import type { KitPlan } from "@/contract";

const HERO = "prod-minhan-backpack";

describe("InMemoryAdapter", () => {
  it("updateListing then undoListing restores the exact previous listing", async () => {
    const a = new InMemoryAdapter();
    const before = await a.getProduct(HERO);
    const updated = await a.updateListing(HERO, {
      title: "Minh An Kids Backpack New Model 2026 – Anti-Hunchback, Lightweight",
      description: before!.description + " Anti-hunchback design.",
      tags: ["kids", "anti-hunchback", "lightweight"],
      attributes: { material: "polyester", weight: "0.75 kg" },
    });
    expect(updated.tags).toContain("anti-hunchback");
    expect(updated.updatedForDemandAt).not.toBeNull();
    expect((await a.searchProducts({ tagsAny: ["anti-hunchback"] })).map((p) => p.id)).toContain(HERO);

    const restored = await a.undoListing(HERO);
    expect(restored).toEqual(before);
    expect(await a.getProduct(HERO)).toEqual(before);
    expect(await a.undoListing(HERO)).toBeNull();
  });

  it("two updates undo one step at a time", async () => {
    const a = new InMemoryAdapter();
    const v0 = await a.getProduct(HERO);
    const patch = { title: "v1", description: "d", tags: ["kids"], attributes: {} };
    const v1 = await a.updateListing(HERO, patch);
    await a.updateListing(HERO, { ...patch, title: "v2" });
    expect(await a.undoListing(HERO)).toEqual(v1);
    expect(await a.undoListing(HERO)).toEqual(v0);
  });

  it("instances do not share state and fixtures stay untouched", async () => {
    const a = new InMemoryAdapter();
    await a.updateListing(HERO, { title: "changed", description: "d", tags: [], attributes: {} });
    const b = new InMemoryAdapter();
    expect((await b.getProduct(HERO))!.title).toBe("Minh An Kids Backpack New Model 2026");
  });

  it("searchProducts filters by text, category, tags and price", async () => {
    const a = new InMemoryAdapter();
    const backpacks = await a.searchProducts({ category: "school-backpack", maxPrice: 400000 });
    expect(backpacks.every((p) => p.category === "school-backpack" && p.price <= 400000)).toBe(true);
    expect(backpacks.map((p) => p.id)).toContain(HERO);
    expect((await a.searchProducts({ text: "spine-care" })).map((p) => p.id)).toEqual([
      "prod-kidzone-ergo-backpack",
    ]);
    expect(await a.searchProducts({ limit: 3 })).toHaveLength(3);
  });

  it("recordIntent + recordDemandItems are visible through demandItemsSince", async () => {
    const a = new InMemoryAdapter();
    const plan: KitPlan = {
      event: "other",
      language: "en",
      budget: null,
      deadline: null,
      items: [],
      assumptions: [],
    };
    const { sessionId } = await a.recordIntent({ query: "adopting a puppy", plan, source: "live" });
    await a.recordDemandItems(sessionId, [
      {
        item: {
          key: "food",
          needLabel: "Puppy food",
          category: null,
          required: true,
          quantity: 1,
          mustHaveTags: [],
          niceToHaveTags: [],
          maxUnitPrice: null,
        },
        matchedCount: 0,
        budgetHint: null,
      },
    ]);
    const rows = await a.demandItemsSince("2026-08-20T00:00:00.000Z");
    const mine = rows.filter((r) => r.sessionId === sessionId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ event: "other", category: null, matchedCount: 0 });
    expect(mine[0].createdAt.startsWith("2026-08-20")).toBe(true);

    const raincoats = await a.demandItemsSince("2026-08-14T00:00:00.000Z", { category: "kids-raincoat" });
    expect(raincoats.length).toBeGreaterThan(0);
    expect(raincoats.every((r) => r.category === "kids-raincoat" && r.createdAt >= "2026-08-14")).toBe(true);
  });

  it("getAdapter() returns the memory adapter when KITLY_ADAPTER=memory", async () => {
    expect(getAdapter()).toBeInstanceOf(InMemoryAdapter);
    expect(getAdapter()).toBe(getAdapter());
  });
});
