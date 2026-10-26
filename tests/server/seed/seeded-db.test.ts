// Planted facts after `npm run seed` (ticket 01 Full). Runs only when SUPABASE_URL is set; reads through the adapter.
import { describe, expect, it } from "vitest";
import { SupabaseAdapter } from "@/server/adapter/supabase";
import { addDays, today } from "@/server/today";

const live = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!live)("seeded Supabase database: planted facts", () => {
  const a = live ? new SupabaseAdapter() : (null as never);

  it("hero backpack is the untouched listing gap", async () => {
    const hero = await a.getProduct("prod-minhan-backpack");
    expect(hero).toMatchObject({
      title: "Minh An Kids Backpack New Model 2026",
      price: 349000,
      tags: ["kids"],
      updatedForDemandAt: null,
    });
  });

  it("exactly one anti-hunchback backpack, zero backpack-cover, zero anti-blue-light", async () => {
    expect((await a.searchProducts({ tagsAny: ["anti-hunchback"] })).map((p) => p.id)).toEqual([
      "prod-kidzone-ergo-backpack",
    ]);
    expect(await a.searchProducts({ tagsAny: ["backpack-cover"] })).toEqual([]);
    expect(await a.searchProducts({ tagsAny: ["anti-blue-light"] })).toEqual([]);
    expect(await a.searchProducts({ category: "kids-raincoat" })).toHaveLength(4);
  });

  it("~360 products over 25 shops, 8 vouchers", async () => {
    const all = await a.searchProducts({});
    expect(all.length).toBeGreaterThanOrEqual(340);
    expect(await a.listShops()).toHaveLength(25);
    expect(await a.listVouchers()).toHaveLength(8);
  });

  it("demand history is served in full (past the 1,000-row page) with the forced this-week count", async () => {
    const rows = await a.demandItemsSince(`${addDays(today(), -27)}T00:00:00.000Z`);
    expect(rows.length).toBeGreaterThan(5000);
    const thisWeek = await a.demandItemsSince(`${addDays(today(), -6)}T00:00:00.000Z`, {
      category: "school-backpack",
    });
    const anti = thisWeek.filter((r) => r.tags.length === 1 && r.tags[0] === "anti-hunchback");
    expect(anti.length).toBeGreaterThanOrEqual(37); // + any live demo runs
  });
});
