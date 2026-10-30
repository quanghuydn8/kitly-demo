// Matcher (seam S5): one catalog query for the whole plan → scored candidates (quality only), noMatch + closest (D27).
import { describe, expect, it } from "vitest";
import type { KitPlan, PlanItem, ProductQuery } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { matchPlan } from "@/server/kit/matcher";
import kitSample from "@/contract/fixtures/kit.sample.json";

const TODAY = "2026-09-02";
const heroPlan = (): KitPlan =>
  structuredClone(
    (kitSample as { event: string; data: { plan?: KitPlan } }[]).find((e) => e.event === "plan")!.data.plan!,
  );

function item(over: Partial<PlanItem> = {}): PlanItem {
  return {
    key: "backpack",
    needLabel: "Backpack",
    category: "school-backpack",
    required: true,
    quantity: 1,
    mustHaveTags: [],
    niceToHaveTags: [],
    maxUnitPrice: null,
    ...over,
  };
}
const planOf = (items: PlanItem[], deadline: string | null = "2026-09-05"): KitPlan => ({
  event: "back_to_school",
  language: "en",
  budget: 1_500_000,
  deadline,
  items,
  assumptions: [],
});

async function run(plan: KitPlan, adapter = new InMemoryAdapter()) {
  return matchPlan(adapter, plan, { shops: await adapter.listShops(), today: TODAY });
}
const ids = (r: Awaited<ReturnType<typeof run>>, key = "backpack") =>
  (r.candidates[key] ?? []).map((c) => c.product.id);

describe("matchPlan: filters", () => {
  it("drops products that cannot arrive by the deadline (today + shipDaysMax)", async () => {
    const r = await run(planOf([item()]));
    expect(ids(r).sort()).toEqual([
      "prod-homie-kids-backpack",
      "prod-kidzone-ergo-backpack",
      "prod-kidzone-lite-backpack",
      "prod-minhan-backpack",
    ]);
    // express deadline Sep 4: the 3-day Homie backpack is too late
    expect(ids(await run(planOf([item()], "2026-09-04")))).not.toContain("prod-homie-kids-backpack");
    expect(r.candidates.backpack.find((c) => c.product.id === "prod-homie-kids-backpack")!.arrivesBy).toBe(
      "2026-09-05",
    );
  });

  it("drops out-of-stock products; no deadline keeps slow ones", async () => {
    const r = await run(planOf([item()], null));
    expect(ids(r)).toContain("prod-bago-backpack-basic");
    expect(ids(r)).not.toContain("prod-bago-backpack-trend"); // stock 0
  });

  it("keeps only products carrying every must-have tag", async () => {
    const r = await run(planOf([item({ mustHaveTags: ["lightweight"] })]));
    expect(ids(r).sort()).toEqual([
      "prod-homie-kids-backpack",
      "prod-kidzone-ergo-backpack",
      "prod-kidzone-lite-backpack",
    ]);
    const both = await run(planOf([item({ mustHaveTags: ["lightweight", "grade-1"] })]));
    expect(ids(both).sort()).toEqual(["prod-kidzone-ergo-backpack", "prod-kidzone-lite-backpack"]);
  });

  it("keeps only products at or under maxUnitPrice", async () => {
    const r = await run(planOf([item({ mustHaveTags: ["lightweight"], maxUnitPrice: 520_000 })]));
    expect(ids(r).sort()).toEqual(["prod-homie-kids-backpack", "prod-kidzone-lite-backpack"]);
    expect(r.matchedCount.backpack).toBe(2);
  });
});

describe("matchPlan: score = quality only, ordered", () => {
  it("scores by nice-to-have tags, rating, reviews and tier (never price) and sorts best first", async () => {
    const r = await run(planOf([item({ niceToHaveTags: ["lightweight"] })]));
    const list = r.candidates.backpack;
    for (let i = 1; i < list.length; i++) expect(list[i - 1].score).toBeGreaterThanOrEqual(list[i].score);
    // worked by hand from CONTRACT §1: 0.35·1 + 0.35·4.9/5 + 0.18·log10(1241)/4 + 0.12·1
    expect(list[0].product.id).toBe("prod-kidzone-ergo-backpack");
    expect(list[0].score).toBeCloseTo(0.952, 2);
    expect(list[0].matchedTags).toEqual(["lightweight"]);
    // Minh An: no tag, 4.8, 412 reviews, preferred = 0 + 0.336 + 0.1177 + 0.072
    expect(list.find((c) => c.product.id === "prod-minhan-backpack")!.score).toBeCloseTo(0.526, 2);
  });
});

describe("matchPlan: noMatch + closest (D27)", () => {
  it("hero backpack: no exact match, closest = Minh An missing anti-hunchback (never in candidates)", async () => {
    const r = await run(heroPlan());
    expect(r.candidates.backpack ?? []).toEqual([]);
    expect(r.matchedCount.backpack).toBe(0);
    const nm = r.noMatch.find((n) => n.itemKey === "backpack")!;
    expect(nm.reason).toBe("no_product_with_tags");
    expect(nm.closest!.candidate.product.id).toBe("prod-minhan-backpack");
    expect(nm.closest!.missingTags).toEqual(["anti-hunchback"]);
    expect(nm.closest!.overMaxPriceBy).toBeNull();
    expect(r.candidates.notebooks.length).toBeGreaterThan(0);
  });

  it("relaxes max price only after tags: closest over the limit carries overMaxPriceBy", async () => {
    const r = await run(planOf([item({ mustHaveTags: ["anti-hunchback"], maxUnitPrice: 300_000 })]));
    const nm = r.noMatch[0];
    expect(nm.reason).toBe("none_in_budget");
    expect(nm.closest!.candidate.product.id).toBe("prod-kidzone-ergo-backpack");
    expect(nm.closest!.missingTags).toEqual([]);
    expect(nm.closest!.overMaxPriceBy).toBe(590_000);
  });

  it("never relaxes the deadline: nothing in time → none_in_time, no closest", async () => {
    const r = await run(planOf([item({ mustHaveTags: ["anti-hunchback"] })], TODAY));
    expect(r.noMatch).toEqual([{ itemKey: "backpack", needLabel: "Backpack", reason: "none_in_time", closest: null }]);
  });

  it("category null → no_category, no closest, matchedCount 0", async () => {
    const r = await run(planOf([item({ key: "dog-food", needLabel: "Dog food", category: null })]));
    expect(r.noMatch).toEqual([{ itemKey: "dog-food", needLabel: "Dog food", reason: "no_category", closest: null }]);
    expect(r.matchedCount["dog-food"]).toBe(0);
  });
});

describe("matchPlan: one catalog round trip (D36)", () => {
  it("makes ONE searchProducts call with every plan category and reports what it compared", async () => {
    const queries: ProductQuery[] = [];
    class Counting extends InMemoryAdapter {
      override async searchProducts(q: ProductQuery) {
        queries.push(q);
        return super.searchProducts(q);
      }
    }
    const r = await run(heroPlan(), new Counting());
    expect(queries).toHaveLength(1);
    expect(queries[0].categories!.sort()).toEqual([...new Set(heroPlan().items.map((i) => i.category!))].sort());
    // hero categories in the fixtures: 24 products from Minh An, KidZone, Homie, Bago
    expect(r.compared).toEqual({ products: 24, shops: 4 });
  });
});
