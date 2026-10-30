// Supabase run (ticket 01 Full): the shared contract suites + planted facts on the SEEDED database.
// Runs only when SUPABASE_URL is set (`npm run test:supabase` loads .env); skipped otherwise.
// Prerequisite: `npm run db:migrate && npm run seed` on KITLY_DB_SCHEMA.
import { describe, expect, it, vi } from "vitest";
import { PersonaSchema, ProductSchema, ShopSchema, VoucherSchema, type Product } from "@/contract";
import { SupabaseAdapter } from "@/server/adapter/supabase";
import { SupabaseKitStore } from "@/server/kitstore/supabase";
import { supabaseClient } from "@/server/db/supabase";
import { depthProblems } from "@/server/seed/depth";
import { LLM_CATEGORIES } from "@/server/seed/world";
import { countMatches } from "@/server/seed/matched";
import { commerceAdapterContract } from "./contracts/commerce-adapter";
import { kitStoreContract } from "./contracts/kit-store";
import { expectPlantedFacts } from "./seed-planted-facts";

const skip = !process.env.SUPABASE_URL;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 }); // network round trips

commerceAdapterContract(
  "SupabaseAdapter",
  {
    make: () => new SupabaseAdapter(),
    cleanup: async (marker) => {
      const { error } = await supabaseClient().from("intent_sessions").delete().eq("query", marker);
      if (error) throw new Error(error.message);
    },
  },
  { skip },
);

kitStoreContract(
  "SupabaseKitStore",
  {
    make: () => new SupabaseKitStore(),
    cleanup: async (prefix) => {
      const { error } = await supabaseClient().from("kit_threads").delete().like("owner", `${prefix}%`);
      if (error) throw new Error(error.message);
    },
  },
  { skip },
);

describe.skipIf(skip)("seeded Supabase database (after npm run seed)", () => {
  const adapter = () => new SupabaseAdapter();
  const all = async (): Promise<Product[]> => ProductSchema.array().parse(await adapter().searchProducts({}));

  it("planted facts are present", async () => {
    expectPlantedFacts(
      {
        products: await all(),
        vouchers: VoucherSchema.array().parse(await adapter().listVouchers("lan")),
        persona: PersonaSchema.parse(await adapter().getPersona("lan")),
        shops: ShopSchema.array().parse(await adapter().listShops()),
      },
      process.env.DEMO_TODAY ?? "2026-09-02",
    );
  });

  it("~360 products, 25 shops; depth + express rules hold for every LLM category", async () => {
    const products = await all();
    const shops = await adapter().listShops();
    expect(shops).toHaveLength(25);
    expect(products.length).toBeGreaterThanOrEqual(340);
    for (const c of LLM_CATEGORIES) {
      const ps = products.filter((p) => p.category === c);
      expect(depthProblems(ps, shops), c).toEqual([]);
      expect(new Set(ps.map((p) => p.shopId)).size, c).toBeGreaterThanOrEqual(3);
    }
  });

  it("demand history: forced this-week / last-week distinct sessions, combo share", async () => {
    const rows = await adapter().demandItemsSince("2026-08-06T00:00:00.000Z");
    const seed = rows; // live rows (if any demo ran) only add to this week
    const week = (d: string) => (d >= "2026-08-27" ? "this" : d >= "2026-08-20" ? "last" : "older");
    const count = (cat: string | null, tag: string | null, w: string) =>
      new Set(
        seed
          .filter(
            (r) =>
              week(r.createdAt.slice(0, 10)) === w &&
              r.category === cat &&
              (tag === null ? r.tags.length === 0 : r.tags.length === 1 && r.tags[0] === tag),
          )
          .map((r) => r.sessionId),
      ).size;
    expect(count("school-backpack", "anti-hunchback", "last")).toBe(21);
    expect(count("school-backpack", "anti-hunchback", "this")).toBeGreaterThanOrEqual(37);
    expect(count("kids-raincoat", "backpack-cover", "this")).toBe(52);
    expect(count("kids-raincoat", "backpack-cover", "last")).toBe(30);
    expect(count("kids-desk-lamp", "anti-blue-light", "this")).toBe(18);
    expect(count("kids-desk-lamp", "anti-blue-light", "last")).toBe(15);
    expect(count(null, null, "last")).toBe(4);
    expect(rows.length).toBeGreaterThan(5000); // paging past the PostgREST 1,000-row cap

    const bts = new Map<string, Set<string | null>>();
    for (const r of rows.filter((x) => x.event === "back_to_school"))
      bts.set(r.sessionId, (bts.get(r.sessionId) ?? new Set()).add(r.category));
    const combo = [...bts.values()].filter((c) =>
      ["school-backpack", "water-bottle", "lunch-box"].every((x) => c.has(x)),
    );
    expect(combo.length / bts.size).toBeGreaterThanOrEqual(0.6);

    const products = await all();
    const hero = rows.find((r) => r.tags[0] === "anti-hunchback")!;
    expect(hero.matchedCount).toBe(countMatches(products, "school-backpack", ["anti-hunchback"]));
    expect(hero.matchedCount).toBe(1);
  });
});
