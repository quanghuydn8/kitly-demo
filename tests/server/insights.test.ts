// Seller insights (seam S3): buildInsights on the In-memory adapter (fixture demand: 20 sessions) + FakeLLM.
// Fixture facts used below (window this week = Aug 27–Sep 2, last week = Aug 20–26, DEMO_TODAY Sep 2):
//   school-backpack|anti-hunchback 5 / 3 sessions, hints 350k×4 + 380k×4 · kids-raincoat|backpack-cover 5 / 3,
//   hints 140k×4 + 150k×4 · kids-desk-lamp|anti-blue-light 2 / 2 · pets (null) 2 / 2 sessions this / last week.
import { describe, expect, it } from "vitest";
import { InsightsResponseSchema, type Gap, type PlanItem } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { InMemoryAdviceStore } from "@/server/advicestore/in-memory";
import { InMemoryWatchStore } from "@/server/watchstore/in-memory";
import { FakeLLM } from "@/server/llm";
import { buildInsights, UnknownShopError } from "@/server/insights";

const TODAY = "2026-09-02";
const judge = (supports: boolean, evidence = "") => ({ supports, evidence });
const advice = (text: string) => ({ advice: text });
const SPINE = "Padded ergonomic back panel with S-shaped straps that keep the spine straight.";

function setup(structured: unknown[] = []) {
  const adapter = new InMemoryAdapter();
  const llm = new FakeLLM({ structured });
  const store = new InMemoryAdviceStore();
  const watches = new InMemoryWatchStore();
  const run = async (shopId: string) =>
    InsightsResponseSchema.parse(await buildInsights({ adapter, llm, advice: store, watches, today: TODAY }, shopId));
  return { adapter, llm, store, watches, run };
}

const item = (needLabel: string, category: string | null, tags: string[] = []): PlanItem => ({
  key: needLabel.toLowerCase().replace(/\s+/g, "-"),
  needLabel,
  category,
  required: true,
  quantity: 1,
  mustHaveTags: tags,
  niceToHaveTags: [],
  maxUnitPrice: null,
});

/** One intent session (dated DEMO_TODAY = this week) whose items are all unmet unless matchedCount is given. */
async function session(
  adapter: InMemoryAdapter,
  items: PlanItem[],
  opts: { source?: "live" | "seed"; matchedCount?: number; budgetHint?: number | null } = {},
) {
  const plan = { event: "back_to_school" as const, language: "en" as const, budget: null, deadline: null, items, assumptions: [] };
  const { sessionId } = await adapter.recordIntent({ query: "test", plan, source: opts.source ?? "seed" });
  await adapter.recordDemandItems(
    sessionId,
    items.map((i) => ({ item: i, matchedCount: opts.matchedCount ?? 0, budgetHint: opts.budgetHint ?? null })),
  );
}

const gap = (gaps: Gap[], key: string) => gaps.find((g) => g.key === key);
const structuredNames = (llm: FakeLLM) => llm.calls.filter((c) => c.kind === "structured").map((c) => c.name);

describe("buildInsights: counts per window", () => {
  it("counts distinct sessions this week / last week with the DEMO_TODAY windows", async () => {
    const { run } = setup();
    const res = await run("shop-trailhead"); // no products in these categories: no judgement calls
    expect(res.window).toEqual({ thisWeekFrom: "2026-08-27", lastWeekFrom: "2026-08-20", today: TODAY });
    expect(gap(res.gaps, "school-backpack|anti-hunchback")).toMatchObject({ thisWeek: 5, lastWeek: 3 });
    expect(gap(res.gaps, "kids-raincoat|backpack-cover")).toMatchObject({ thisWeek: 5, lastWeek: 3 });
  });

  it("only unmet items (matchedCount < 2) make gaps", async () => {
    const { adapter, run } = setup();
    for (let i = 0; i < 3; i++) await session(adapter, [item("Leak-proof bottle", "water-bottle", ["leak-proof"])], { matchedCount: 2 });
    for (let i = 0; i < 3; i++) await session(adapter, [item("Insulated lunch box", "lunch-box", ["insulated"])], { matchedCount: 1 });
    const res = await run("shop-trailhead");
    expect(gap(res.gaps, "water-bottle|leak-proof")).toBeUndefined();
    expect(gap(res.gaps, "lunch-box|insulated")).toMatchObject({ thisWeek: 3, lastWeek: 0 });
    expect(res.gaps.some((g) => g.category === "water-bottle" && g.tags.length === 0)).toBe(false); // fixture rows are met
  });

  it("a session with two items in the same gap counts once", async () => {
    const { adapter, run } = setup();
    const bottle = item("Leak-proof bottle", "water-bottle", ["leak-proof"]);
    await session(adapter, [bottle, { ...bottle, key: "bottle-2", needLabel: "Second leak-proof bottle" }]);
    await session(adapter, [bottle]);
    await session(adapter, [bottle]);
    expect(gap((await run("all")).gaps, "water-bottle|leak-proof")?.thisWeek).toBe(3);
  });

  it("a gap with thisWeek 2 is absent and 3 is present (fixture desk lamp: 2 → 3)", async () => {
    const { adapter, run } = setup();
    expect(gap((await run("all")).gaps, "kids-desk-lamp|anti-blue-light")).toBeUndefined();
    await session(adapter, [item("Anti-blue-light desk lamp", "kids-desk-lamp", ["anti-blue-light"])]);
    expect(gap((await run("all")).gaps, "kids-desk-lamp|anti-blue-light")).toMatchObject({ thisWeek: 3, lastWeek: 2 });
  });

  it("gap key = category|sorted tags", async () => {
    const { adapter, run } = setup();
    for (let i = 0; i < 3; i++) await session(adapter, [item("Quiet foldable fan", "desk-fan", ["quiet", "foldable"])]);
    const g = gap((await run("all")).gaps, "desk-fan|foldable,quiet");
    expect(g).toMatchObject({ category: "desk-fan", tags: ["foldable", "quiet"], needLabel: "Quiet foldable fan" });
  });
});

describe("buildInsights: null-category needs", () => {
  it("three differently-labelled null-category needs yield exactly one none| gap labelled with the 2 most common", async () => {
    const { adapter, run } = setup();
    // fixture this week: 2 sessions × (Dog food, Dog bed, Dog leash); + Dog food ×2, Cat litter ×1 → food 4, bed 2, leash 2
    await session(adapter, [item("Dog food", null), item("Cat litter", null)]);
    await session(adapter, [item("Dog food", null)]);
    const res = await run("all");
    const none = res.gaps.filter((g) => g.category === null);
    expect(none).toHaveLength(1);
    expect(none[0]).toMatchObject({
      key: "none|",
      type: "assortment_gap",
      category: null,
      tags: [],
      needLabel: "Not in catalog: Dog food, Dog bed",
      thisWeek: 4,
      lastWeek: 2,
      matchingProducts: 0,
      priceBand: null,
      appliedFix: null,
    });
  });
});

describe("buildInsights: price band, neededWith, matching products", () => {
  it("p25/p75 of the gap's budget hints (both weeks)", async () => {
    const { run } = setup();
    const res = await run("shop-trailhead");
    expect(gap(res.gaps, "school-backpack|anti-hunchback")?.priceBand).toEqual({ p25: 350000, p75: 380000 });
    expect(gap(res.gaps, "kids-raincoat|backpack-cover")?.priceBand).toEqual({ p25: 140000, p75: 150000 });
  });

  it("neededWith = top 3 co-occurring categories in the gap's sessions this week, with share", async () => {
    const { run } = setup();
    const g = gap((await run("shop-trailhead")).gaps, "school-backpack|anti-hunchback")!;
    expect(g.neededWith).toEqual([
      { category: "lunch-box", share: 1 },
      { category: "water-bottle", share: 0.6 },
      { category: "kids-raincoat", share: 0.4 },
    ]);
  });

  it("matchingProducts = in-stock products of any shop in the category carrying every gap tag", async () => {
    const { run } = setup();
    const res = await run("shop-trailhead");
    expect(gap(res.gaps, "school-backpack|anti-hunchback")?.matchingProducts).toBe(1); // KidZone Ergo
    expect(gap(res.gaps, "kids-raincoat|backpack-cover")?.matchingProducts).toBe(0);
  });

  it("combos (top 5 category pairs this week) and topNeeds (sessions per event this week)", async () => {
    const { run } = setup();
    const res = await run("shop-trailhead");
    expect(res.combos).toEqual([
      { categories: ["school-backpack", "water-bottle"], count: 6 },
      { categories: ["kids-raincoat", "school-backpack"], count: 5 },
      { categories: ["lunch-box", "school-backpack"], count: 5 },
      { categories: ["kids-raincoat", "water-bottle"], count: 3 },
      { categories: ["lunch-box", "water-bottle"], count: 3 },
    ]);
    expect(res.topNeeds).toEqual([
      { event: "back_to_school", count: 10 },
      { event: "other", count: 2 },
    ]);
  });
});

describe("buildInsights: classification + shop filter", () => {
  it("shop-minhan: the backpack is a listing_gap with the supported candidate and its evidence; raincoat is assortment", async () => {
    // judgement order: gap key asc, then product id asc → raincoat (Minh An raincoat) then backpack (hero product)
    const { llm, run } = setup([judge(false), judge(true, SPINE), advice("Tag it."), advice("Stock it.")]);
    const res = await run("shop-minhan");
    const backpack = gap(res.gaps, "school-backpack|anti-hunchback")!;
    expect(backpack.type).toBe("listing_gap");
    expect(backpack.candidates).toEqual([
      { productId: "prod-minhan-backpack", title: "Minh An Kids Backpack New Model 2026", evidence: SPINE },
    ]);
    expect(backpack.appliedFix).toBeNull();
    const raincoat = gap(res.gaps, "kids-raincoat|backpack-cover")!;
    expect(raincoat.type).toBe("assortment_gap");
    expect(raincoat.candidates).toBeUndefined();
    expect(structuredNames(llm)).toEqual(["listing_fit", "listing_fit", "gap_advice", "gap_advice"]);
    const fit = llm.calls.find((c) => c.name === "listing_fit" && c.messages.some((m) => m.content.includes("spine")))!;
    expect(fit.messages.map((m) => m.content).join("\n")).toContain("anti-hunchback");
  });

  it("listing_gaps come first for a specific shop even when an assortment gap has a higher thisWeek", async () => {
    const { adapter, run } = setup([judge(false), judge(true, SPINE), advice("a"), advice("b")]);
    for (let i = 0; i < 3; i++) await session(adapter, [item("Raincoat with backpack cover", "kids-raincoat", ["backpack-cover"])]);
    const res = await run("shop-minhan");
    expect(gap(res.gaps, "kids-raincoat|backpack-cover")!.thisWeek).toBe(8);
    expect(res.gaps[0]).toMatchObject({ key: "school-backpack|anti-hunchback", type: "listing_gap", thisWeek: 5 });
    expect(res.gaps[1]).toMatchObject({ key: "kids-raincoat|backpack-cover", type: "assortment_gap" });
  });

  it("candidates: only this shop's products in the category within 1.3 × p75 that lack a gap tag", async () => {
    // Bago: 3 untagged backpacks (150–250k) → 3 judgements, none supported → assortment
    const { llm, run } = setup([judge(false), judge(false), judge(false), advice("a"), advice("b")]);
    const res = await run("shop-bago");
    expect(gap(res.gaps, "school-backpack|anti-hunchback")!.type).toBe("assortment_gap");
    const judged = llm.calls.filter((c) => c.name === "listing_fit").map((c) => c.messages.map((m) => m.content).join());
    expect(judged).toHaveLength(3);
    expect(judged.every((t) => t.includes("Bago"))).toBe(true);
  });

  it("a shop with no products in the gap categories makes no judgement call and sorts by thisWeek", async () => {
    const { llm, run } = setup([advice("a"), advice("b")]);
    const res = await run("shop-trailhead");
    expect(structuredNames(llm).filter((n) => n === "listing_fit")).toHaveLength(0);
    expect(res.gaps.every((g) => g.type === "assortment_gap" && g.appliedFix === null)).toBe(true);
  });

  it("shopId=all classifies against every shop, sorted by thisWeek only, appliedFix always null", async () => {
    // all-shop candidates: raincoats kidzone(149k) + minhan(99k); backpacks ≤ 494k lacking the tag: bago×3, homie, minhan
    const { adapter, llm, run } = setup([
      judge(false), // prod-kidzone-raincoat
      judge(false), // prod-minhan-raincoat
      judge(false), // prod-bago-backpack-basic
      judge(false), // prod-bago-backpack-color
      judge(false), // prod-bago-backpack-trend
      judge(false), // prod-homie-kids-backpack
      judge(true, SPINE), // prod-minhan-backpack
      advice("a"),
      advice("b"),
    ]);
    for (let i = 0; i < 3; i++) await session(adapter, [item("Raincoat with backpack cover", "kids-raincoat", ["backpack-cover"])]);
    const res = await run("all");
    expect(structuredNames(llm).filter((n) => n === "listing_fit")).toHaveLength(7);
    expect(res.gaps.map((g) => g.key)).toEqual(["kids-raincoat|backpack-cover", "school-backpack|anti-hunchback"]);
    expect(res.gaps[1]).toMatchObject({ type: "listing_gap", appliedFix: null });
    expect(res.gaps[1].candidates?.map((c) => c.productId)).toEqual(["prod-minhan-backpack"]);
  });

  it("an LLM judgement error counts as not supported (the page still loads)", async () => {
    const { run } = setup([judge(false), new Error("proxy down"), advice("a"), advice("b")]);
    const res = await run("shop-minhan");
    expect(gap(res.gaps, "school-backpack|anti-hunchback")!.type).toBe("assortment_gap");
  });

  it("unknown shop id throws UnknownShopError", async () => {
    const { run } = setup();
    await expect(run("shop-nope")).rejects.toBeInstanceOf(UnknownShopError);
  });

  it("returns at most 8 gaps", async () => {
    const { adapter, run } = setup();
    const tags = ["leak-proof", "insulated", "bpa-free", "compact", "foldable", "quiet", "ergonomic", "wireless"];
    for (const t of tags) for (let i = 0; i < 3; i++) await session(adapter, [item(`Bottle ${t}`, "water-bottle", [t])]);
    expect((await run("shop-trailhead")).gaps).toHaveLength(8);
  });
});

describe("buildInsights: appliedFix", () => {
  const HERO_FIX = {
    title: "Minh An Kids Backpack New Model 2026 | Anti-hunchback, Lightweight",
    description: "Padded ergonomic back panel. Anti-hunchback design.",
    tags: ["kids", "anti-hunchback", "lightweight", "grade-1"],
    attributes: { material: "polyester", weight: "0.75 kg" },
  };

  it("after updateListing the gap stays listing_gap with appliedFix (no LLM judgement), stable on reload; undo clears it", async () => {
    const { adapter, llm, run } = setup([
      judge(false), // raincoat (1st load)
      advice("a"),
      advice("b"),
      judge(false), // raincoat (reload; advice cached)
      judge(false), // raincoat (after undo)
      judge(true, SPINE), // backpack candidate again (after undo)
      advice("c"), // backpack advice regenerated: matchingProducts changed 2 → 1
    ]);
    const fixed = await adapter.updateListing("prod-minhan-backpack", HERO_FIX);
    expect(fixed.updatedForDemandAt).not.toBeNull();

    for (let load = 0; load < 2; load++) {
      const g = gap((await run("shop-minhan")).gaps, "school-backpack|anti-hunchback")!;
      expect(g.type).toBe("listing_gap");
      expect(g.appliedFix).toEqual({ productId: "prod-minhan-backpack", title: HERO_FIX.title, appliedAt: fixed.updatedForDemandAt });
    }
    const judgedBackpack = llm.calls.filter((c) => c.name === "listing_fit" && c.messages.some((m) => m.content.includes("spine")));
    expect(judgedBackpack).toHaveLength(0);

    await adapter.undoListing("prod-minhan-backpack");
    const after = gap((await run("shop-minhan")).gaps, "school-backpack|anti-hunchback")!;
    expect(after.appliedFix).toBeNull();
    expect(after.type).toBe("listing_gap");
    expect(after.candidates?.[0].productId).toBe("prod-minhan-backpack");
  });

  it("appliedFix is null for shopId=all and for assortment gaps", async () => {
    const { adapter, run } = setup(Array(20).fill(judge(false)));
    await adapter.updateListing("prod-minhan-backpack", HERO_FIX);
    const res = await run("all");
    expect(res.gaps.every((g) => g.appliedFix === null)).toBe(true);
  });
});

describe("buildInsights: advice", () => {
  it("one fast-model sentence per gap, fast model + effort", async () => {
    const { llm, run } = setup([advice("Add a backpack cover option."), advice("Tag your backpack anti-hunchback.")]);
    const res = await run("shop-trailhead");
    // thisWeek tie (5 / 5) → key asc: raincoat first
    expect(res.gaps.map((g) => g.advice)).toEqual(["Add a backpack cover option.", "Tag your backpack anti-hunchback."]);
    expect(llm.calls.every((c) => c.model === "gpt-6-luna" && c.effort === "low")).toBe(true);
  });

  it("cache hit does not call the LLM again; counts change ⇒ regenerated", async () => {
    const { adapter, llm, store, run } = setup([advice("Raincoat v1."), advice("Backpack v1."), advice("Raincoat v2.")]);
    await run("shop-trailhead");
    expect(llm.calls).toHaveLength(2);
    expect(await store.get("kids-raincoat|backpack-cover")).toEqual({ countsSignature: "5|3|0", advice: "Raincoat v1." });

    const again = await run("shop-trailhead");
    expect(llm.calls).toHaveLength(2);
    expect(again.gaps.map((g) => g.advice)).toEqual(["Raincoat v1.", "Backpack v1."]);

    await session(adapter, [item("Raincoat with backpack cover", "kids-raincoat", ["backpack-cover"])]);
    const third = await run("shop-trailhead");
    expect(llm.calls).toHaveLength(3);
    expect(gap(third.gaps, "kids-raincoat|backpack-cover")!.advice).toBe("Raincoat v2.");
    expect(gap(third.gaps, "school-backpack|anti-hunchback")!.advice).toBe("Backpack v1.");
  });

  it("an advice LLM error falls back to a code sentence that is not cached", async () => {
    const { store, run } = setup([new Error("down"), new Error("down")]);
    const res = await run("shop-trailhead");
    for (const g of res.gaps) {
      expect(g.advice.length).toBeGreaterThan(10);
      expect(g.advice).toContain(String(g.thisWeek));
    }
    expect(await store.get("kids-raincoat|backpack-cover")).toBeNull();
  });
});

describe("buildInsights: recent (D35)", () => {
  it("the 10 newest LIVE unmet items, newest first; seed rows and met items never appear", async () => {
    const { run } = setup();
    const before = await run("shop-trailhead");
    // fixture live unmet rows: s18 desk lamp, s19 3 pets, s20 backpack + raincoat (all older than the seed rows of Sep 2)
    expect(before.recent).toHaveLength(6);
    expect(before.recent[0]).toMatchObject({ needLabel: "Anti-blue-light desk lamp", createdAt: "2026-08-23T13:15:00.000Z" });
    expect(before.recent.map((r) => r.needLabel)).not.toContain("Notebooks");
  });

  // rehearsal 2 (31/10): the Beat 1 live query showed up as "School backpack" / "Balo chống gù" (the planner's own label)
  // while the card below says "Anti-hunchback backpack" — the strip must name the need like its gap card does
  it("a live item that belongs to a known gap carries that gap's name; items without a category keep their own", async () => {
    const { adapter, run } = setup();
    await session(adapter, [item("School backpack", "school-backpack", ["anti-hunchback"]), item("Dog bed", null)], { source: "live" });
    const res = await run("shop-minhan");
    const labels = res.recent.slice(0, 2).map((r) => r.needLabel).sort();
    expect(labels).toEqual(["Anti-hunchback backpack", "Dog bed"]);
  });

  it("caps at 10", async () => {
    const { adapter, run } = setup();
    for (let i = 0; i < 12; i++) await session(adapter, [item(`Live need ${i}`, null)], { source: "live" });
    expect((await run("shop-trailhead")).recent).toHaveLength(10);
  });
});

describe("buildInsights: watchers (Full, ticket 07)", () => {
  it("each gap carries its watch count; unwatched gaps 0; watches on other keys ignored", async () => {
    const { watches, run } = setup();
    await watches.add("kids-raincoat|backpack-cover");
    await watches.add("kids-raincoat|backpack-cover");
    await watches.add("not-a-visible|gap");
    const res = await run("all");
    const byKey = new Map(res.gaps.map((g) => [g.key, g.watchers]));
    expect(byKey.get("kids-raincoat|backpack-cover")).toBe(2);
    expect(byKey.get("school-backpack|anti-hunchback")).toBe(0);
    expect(res.gaps.every((g) => typeof g.watchers === "number")).toBe(true);
  });
});
