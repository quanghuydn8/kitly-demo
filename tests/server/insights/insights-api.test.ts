// Seam S3 — GET /api/seller/insights with the InMemoryAdapter (fixtures) + FakeLLM:
// weekly windows, unmet threshold, price band, needed-with, listing vs assortment classification, shop filter,
// advice cache, and a live kit run feeding the counts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  ApiErrorSchema,
  InsightsResponseSchema,
  type InsightsResponse,
  type KitPlan,
  type PlanItem,
} from "@/contract";
import { kitSample } from "@/contract/fixtures";
import { getAdapter, resetAdapterForTests } from "@/server/adapter";
import { FakeLLM, models, setLLMForTests, type LLMMessage } from "@/server/llm";
import { resetInsightsCacheForTests } from "@/server/insights";
import { GET } from "@/app/api/seller/insights/route";
import { POST as postKit } from "@/app/api/kit/route";

const BACKPACK = "school-backpack|anti-hunchback";
const RAINCOAT = "kids-raincoat|backpack-cover";
const LAMP = "kids-desk-lamp|anti-blue-light";
const HERO_TITLE = "Minh An Kids Backpack New Model 2026";
const HERO_QUOTE = "S-shaped straps that keep the spine straight";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/seller/insights${qs}`));

async function insights(shopId: string): Promise<InsightsResponse> {
  const res = await get(`?shopId=${shopId}`);
  expect(res.status).toBe(200);
  return InsightsResponseSchema.parse(await res.json());
}

const userText = (messages: LLMMessage[]) =>
  messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");

/** Fast-model fake: only the hero backpack's description supports the gap tags; the light backpack gets a
 *  fabricated quote (must be rejected); advice echoes the need. Records which listings were judged. */
function makeLLM(opts: { adviceFails?: boolean } = {}) {
  const judged: string[] = [];
  const llm = new FakeLLM({
    respond: ({ name, messages }) => {
      const text = userText(messages);
      if (name === "listing_fit") {
        const title = /"title":"([^"]+)"/.exec(text)?.[1] ?? "?";
        judged.push(title);
        if (title === HERO_TITLE) return { supports: true, evidence: HERO_QUOTE };
        if (title.includes("Featherlight"))
          return { supports: true, evidence: "Certified anti-hunchback frame" };
        return { supports: false, evidence: "" };
      }
      if (name === "seller_advice") {
        if (opts.adviceFails) throw new Error("model down");
        const need = /"needLabel":"([^"]+)"/.exec(text)?.[1] ?? "?";
        return { advice: `Advice for ${need}.` };
      }
      throw new Error(`unexpected call ${name}`);
    },
  });
  setLLMForTests(llm);
  const calls = (name: string) => llm.calls.filter((c) => c.name === name).length;
  return { llm, judged, calls };
}

const item = (over: Partial<PlanItem>): PlanItem => ({
  key: "x",
  needLabel: "Need",
  category: null,
  required: true,
  quantity: 1,
  mustHaveTags: [],
  niceToHaveTags: [],
  maxUnitPrice: null,
  ...over,
});

/** Records one live session (lands on DEMO_TODAY = this week) through the adapter. */
async function recordLive(
  event: KitPlan["event"],
  rows: { item: PlanItem; matchedCount: number; budgetHint?: number }[],
) {
  const a = getAdapter();
  const plan: KitPlan = {
    event,
    language: "en",
    budget: null,
    deadline: null,
    items: rows.map((r) => r.item),
    assumptions: [],
  };
  const { sessionId } = await a.recordIntent({ query: "test", plan, source: "live" });
  await a.recordDemandItems(
    sessionId,
    rows.map((r) => ({ item: r.item, matchedCount: r.matchedCount, budgetHint: r.budgetHint ?? null })),
  );
}

const gap = (r: InsightsResponse, key: string) => r.gaps.find((g) => g.key === key)!;

beforeEach(() => {
  resetAdapterForTests();
  resetInsightsCacheForTests();
});
afterEach(() => setLLMForTests(null));

describe("GET /api/seller/insights — aggregation", () => {
  it("windows on DEMO_TODAY, counts this week / last week per gap key, sorted by thisWeek desc", async () => {
    makeLLM();
    const r = await insights("all");
    expect(r.window).toEqual({ thisWeekFrom: "2026-08-14", lastWeekFrom: "2026-08-07", today: "2026-08-20" });
    expect(r.gaps.map((g) => [g.key, g.thisWeek, g.lastWeek])).toEqual([
      [RAINCOAT, 10, 6],
      [BACKPACK, 8, 5],
      [LAMP, 4, 3],
      ["none|", 3, 1],
      ["diapers|newborn-0-3m", 3, 0],
      ["office-chair|ergonomic", 2, 0],
      ["tent|4-person", 2, 0],
      ["rice-cooker|compact", 0, 2],
    ]);
    expect(gap(r, BACKPACK)).toMatchObject({
      needLabel: "Anti-hunchback backpack",
      category: "school-backpack",
      tags: ["anti-hunchback"],
      matchingProducts: 1,
    });
    expect(gap(r, RAINCOAT).matchingProducts).toBe(0);
    expect(gap(r, "none|")).toMatchObject({
      category: null,
      tags: [],
      matchingProducts: 0,
      type: "assortment_gap",
    });
  });

  it("only plan items with matchedCount < 2 are unmet; at most 8 gaps are returned", async () => {
    makeLLM();
    await recordLive("back_to_school", [
      {
        item: item({ needLabel: "Insulated lunch box", category: "lunch-box", mustHaveTags: ["insulated"] }),
        matchedCount: 1,
      },
      {
        item: item({
          needLabel: "Leak-proof lunch box",
          category: "lunch-box",
          mustHaveTags: ["leak-proof"],
        }),
        matchedCount: 2,
      },
    ]);
    const r = await insights("all");
    const keys = r.gaps.map((g) => g.key);
    expect(keys).toHaveLength(8);
    expect(keys).toContain("lunch-box|insulated");
    expect(keys).not.toContain("lunch-box|leak-proof");
    expect(keys).not.toContain("rice-cooker|compact"); // 0 this week, pushed out of the top 8
    expect(keys.some((k) => k.startsWith("water-bottle"))).toBe(false); // seeded rows with matchedCount ≥ 2
  });

  it("gap keys sort tags, so the same need with tags in another order is one gap", async () => {
    makeLLM();
    const tags = (t: string[]) => item({ needLabel: "Tent", category: "tent", mustHaveTags: t });
    await recordLive("camping_trip", [{ item: tags(["waterproof", "2-person"]), matchedCount: 0 }]);
    await recordLive("camping_trip", [{ item: tags(["2-person", "waterproof"]), matchedCount: 0 }]);
    const g = gap(await insights("all"), "tent|2-person,waterproof");
    expect(g).toMatchObject({ thisWeek: 2, tags: ["2-person", "waterproof"] });
  });

  it("price band = p25/p75 of the budget hints over both weeks (null without hints)", async () => {
    makeLLM();
    const r = await insights("all");
    expect(gap(r, BACKPACK).priceBand).toEqual({ p25: 300000, p75: 400000 });
    expect(gap(r, RAINCOAT).priceBand).toEqual({ p25: 120000, p75: 180000 });
    expect(gap(r, LAMP).priceBand).toEqual({ p25: 275000, p75: 350000 });
    expect(gap(r, "none|").priceBand).toBeNull();
  });

  it("neededWith = top 3 other categories in the gap's sessions with their share; combos + top needs this week", async () => {
    makeLLM();
    const backpack = item({
      key: "bp",
      needLabel: "Anti-hunchback backpack",
      category: "school-backpack",
      mustHaveTags: ["anti-hunchback"],
    });
    const bottle = item({ key: "wb", needLabel: "Water bottle", category: "water-bottle" });
    const lunch = item({ key: "lb", needLabel: "Lunch box", category: "lunch-box" });
    const notebooks = item({ key: "nb", needLabel: "Notebooks", category: "notebooks" });
    const shoes = item({ key: "sh", needLabel: "Shoes", category: "school-shoes" });
    for (const extra of [[notebooks, shoes], [], []]) {
      await recordLive("back_to_school", [
        { item: backpack, matchedCount: 0, budgetHint: 350000 },
        { item: bottle, matchedCount: 5 },
        { item: lunch, matchedCount: 5 },
        ...extra.map((i) => ({ item: i, matchedCount: 5 })),
      ]);
    }
    const r = await insights("all");
    // 13 seeded backpack sessions (single-item) + 3 live ones
    expect(gap(r, BACKPACK).neededWith).toEqual([
      { category: "lunch-box", share: 0.19 },
      { category: "water-bottle", share: 0.19 },
      { category: "notebooks", share: 0.06 },
    ]);
    expect(gap(r, BACKPACK).thisWeek).toBe(11);
    expect(r.combos[0]).toEqual({ categories: ["lunch-box", "school-backpack", "water-bottle"], count: 3 });
    expect(r.combos.length).toBeLessThanOrEqual(5);
    // pair already inside a taken triple with the same count is not repeated
    expect(r.combos.some((c) => c.categories.join() === "lunch-box,water-bottle")).toBe(false);
    // counted per session, per event, this week only
    const bts = r.topNeeds.find((t) => t.event === "back_to_school")!;
    expect(r.topNeeds[0]).toEqual(bts);
    expect(r.topNeeds.map((t) => t.count)).toEqual([...r.topNeeds.map((t) => t.count)].sort((a, b) => b - a));
  });

  it("combos prefer the triple over pairs it mostly explains (≥ 80% of the pair's count)", async () => {
    makeLLM();
    const cat = (category: string) => ({
      item: item({ key: category, needLabel: category, category }),
      matchedCount: 5,
    });
    for (let i = 0; i < 4; i++)
      await recordLive("back_to_school", [cat("school-backpack"), cat("water-bottle"), cat("lunch-box")]);
    await recordLive("back_to_school", [cat("water-bottle"), cat("lunch-box")]);
    const r = await insights("all");
    expect(r.combos).toEqual([{ categories: ["lunch-box", "school-backpack", "water-bottle"], count: 4 }]);
  });

  it("400 without shopId, 404 for an unknown shop", async () => {
    makeLLM();
    const bad = await get("");
    expect(bad.status).toBe(400);
    ApiErrorSchema.parse(await bad.json());
    const missing = await get("?shopId=shop-nope");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
  });
});

describe("GET /api/seller/insights — classification", () => {
  it("Minh An: the hero backpack is a listing gap with a verbatim evidence quote; a fabricated quote is rejected", async () => {
    const { judged } = makeLLM();
    const r = await insights("shop-minhan");
    const g = gap(r, BACKPACK);
    expect(g.type).toBe("listing_gap");
    expect(g.candidates).toEqual([
      { productId: "prod-minhan-backpack", title: HERO_TITLE, evidence: HERO_QUOTE },
    ]);
    // both Minh An backpacks within 1.3 × p75 (520k) lacking the tag were judged; nothing from other shops
    expect(judged).toEqual(expect.arrayContaining([HERO_TITLE, "Minh An Featherlight Kids Backpack"]));
    expect(judged.some((t) => /KidZone|Bago/.test(t))).toBe(false);
    expect(gap(r, RAINCOAT)).toMatchObject({ type: "assortment_gap" });
    expect(gap(r, RAINCOAT).candidates).toBeUndefined();
  });

  it("shop filter: KidZone has no fitting backpack listing → assortment gap; all shops → listing gap", async () => {
    const { judged } = makeLLM();
    expect(gap(await insights("shop-kidzone"), BACKPACK)).toMatchObject({ type: "assortment_gap" });
    // KidZone Air (520k ≤ 520k) lacks the tag and is judged; the Ergo already carries it and is not a candidate
    expect(judged).toContain("KidZone AirLite Junior Backpack");
    expect(judged.some((t) => t.includes("Ergo"))).toBe(false);
    const all = gap(await insights("all"), BACKPACK);
    expect(all.type).toBe("listing_gap");
    expect(all.candidates?.map((c) => c.productId)).toEqual(["prod-minhan-backpack"]);
  });

  it("price filter: candidates cost at most 1.3 × p75 of the buyers' budget hints", async () => {
    const { judged } = makeLLM();
    const ergo = (await getAdapter().getProduct("prod-kidzone-ergo-backpack"))!;
    // strip its tag so only the price keeps it out: 890k > 1.3 × 400k
    await getAdapter().updateListing(ergo.id, {
      title: ergo.title,
      description: ergo.description,
      tags: ["kids"],
      attributes: ergo.attributes,
    });
    await insights("shop-kidzone");
    expect(judged).toContain("KidZone AirLite Junior Backpack"); // 520k = exactly 1.3 × 400k
    expect(judged.some((t) => t.includes("Ergo"))).toBe(false);
    const bp = item({
      needLabel: "Anti-hunchback backpack",
      category: "school-backpack",
      mustHaveTags: ["anti-hunchback"],
    });
    const hints = async (n: number, hint: number) => {
      for (let k = 0; k < n; k++)
        await recordLive("back_to_school", [{ item: bp, matchedCount: 0, budgetHint: hint }]);
      judged.length = 0;
      return gap(await insights("shop-kidzone"), BACKPACK);
    };
    // p75 = 650k → cutoff 845k < 890k: still out
    expect((await hints(30, 650000)).priceBand?.p75).toBe(650000);
    expect(judged.some((t) => t.includes("Ergo"))).toBe(false);
    // p75 = 700k → cutoff 910k ≥ 890k: now judged
    expect((await hints(30, 700000)).priceBand?.p75).toBe(700000);
    expect(judged.some((t) => t.includes("Ergo"))).toBe(true);
  });

  it("a judge failure is an honest 502 llm_error", async () => {
    setLLMForTests(
      new FakeLLM({
        respond: () => {
          throw new Error("proxy down");
        },
      }),
    );
    const res = await get("?shopId=shop-minhan");
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("llm_error");
  });
});

describe("GET /api/seller/insights — advice", () => {
  it("one fast-model sentence per gap, built from the gap facts", async () => {
    const { llm } = makeLLM();
    const r = await insights("all");
    expect(gap(r, BACKPACK).advice).toBe("Advice for Anti-hunchback backpack.");
    const adviceCalls = llm.calls.filter((c) => c.name === "seller_advice");
    expect(adviceCalls).toHaveLength(8);
    expect(new Set(adviceCalls.map((c) => c.model))).toEqual(new Set([models.fast()]));
    expect(llm.calls.filter((c) => c.name === "listing_fit").every((c) => c.model === models.fast())).toBe(
      true,
    );
  });

  it("cache hit does not call the LLM again; changed counts regenerate only that gap", async () => {
    const { calls } = makeLLM();
    await insights("all");
    expect(calls("seller_advice")).toBe(8);
    await insights("all");
    expect(calls("seller_advice")).toBe(8);
    await recordLive("back_to_school", [
      {
        item: item({
          needLabel: "Kids raincoat with backpack cover",
          category: "kids-raincoat",
          mustHaveTags: ["backpack-cover"],
        }),
        matchedCount: 0,
      },
    ]);
    const r = await insights("all");
    expect(calls("seller_advice")).toBe(9);
    expect(gap(r, RAINCOAT).thisWeek).toBe(11);
  });

  it("advice is cached per gap type, so switching shops (listing ↔ assortment) does not regenerate it", async () => {
    const { calls } = makeLLM();
    await insights("shop-minhan");
    expect(calls("seller_advice")).toBe(8);
    await insights("shop-kidzone"); // backpack flips to assortment_gap → one new sentence
    expect(calls("seller_advice")).toBe(9);
    await insights("shop-minhan");
    await insights("shop-kidzone");
    expect(calls("seller_advice")).toBe(9);
  });

  it("advice failure falls back to a code sentence and is not cached", async () => {
    makeLLM({ adviceFails: true });
    const r = await insights("all");
    expect(gap(r, RAINCOAT).advice).toMatch(/10 buyers this week/);
    const { calls } = makeLLM();
    await insights("all");
    expect(calls("seller_advice")).toBe(8);
  });
});

describe("live loop", () => {
  it("a live kit run increments the matching gap's thisWeek by 1", async () => {
    makeLLM();
    const before = gap(await insights("all"), BACKPACK).thisWeek;
    const hero: KitPlan = kitSample.flatMap((e) => (e.event === "plan" ? [e.data.plan] : []))[0];
    setLLMForTests(new FakeLLM({ structured: [hero], stream: ["ok"] }));
    const res = await postKit(
      new NextRequest("http://localhost/api/kit", {
        method: "POST",
        body: JSON.stringify({ query: "Grade 1 kit" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await res.text()).toContain("event: done");
    makeLLM();
    expect(gap(await insights("all"), BACKPACK).thisWeek).toBe(before + 1);
  });
});
