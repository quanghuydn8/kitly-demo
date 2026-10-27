// Seam S3 — GET /api/seller/insights with the InMemoryAdapter (fixtures) + FakeLLM:
// weekly windows, unmet threshold, price band, needed-with, listing vs assortment classification, shop filter,
// advice cache, and a live kit run feeding the counts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  ApiErrorSchema,
  DemandWatchResponseSchema,
  gapKeyFor,
  InsightsResponseSchema,
  type InsightsResponse,
  type KitPlan,
  type PlanItem,
} from "@/contract";
import { kitSample } from "@/contract/fixtures";
import { getAdapter, resetAdapterForTests } from "@/server/adapter";
import { FakeLLM, models, setLLMForTests, type LLMMessage } from "@/server/llm";
import { resetInsightsCacheForTests } from "@/server/insights";
import { MIN_GAP_THIS_WEEK } from "@/server/insights/aggregate";
import { resetProposalsForTests } from "@/server/enrichment";
import { POST as applyEnrichment } from "@/app/api/seller/enrichment/apply/route";
import { POST as previewEnrichment } from "@/app/api/seller/enrichment/preview/route";
import { POST as undoEnrichment } from "@/app/api/seller/enrichment/undo/route";
import { GET } from "@/app/api/seller/insights/route";
import { POST as postKit } from "@/app/api/kit/route";
import { POST as postWatch } from "@/app/api/demand/watch/route";

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
      if (name === "listing_enrichment")
        return {
          titleSuffix: "Anti-Hunchback",
          tags: [{ tag: "anti-hunchback", evidence: HERO_QUOTE }],
          attributes: [],
          descriptionAppend: "",
        };
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
  resetProposalsForTests();
});
afterEach(() => setLLMForTests(null));

describe("GET /api/seller/insights — aggregation", () => {
  it("windows on DEMO_TODAY, counts this week / last week per gap key (F7: only thisWeek ≥ 3), sorted by thisWeek desc", async () => {
    makeLLM();
    const r = await insights("all");
    expect(r.window).toEqual({ thisWeekFrom: "2026-08-14", lastWeekFrom: "2026-08-07", today: "2026-08-20" });
    expect(r.gaps.map((g) => [g.key, g.thisWeek, g.lastWeek])).toEqual([
      [RAINCOAT, 10, 6],
      [BACKPACK, 8, 5],
      [LAMP, 4, 3],
      ["none|", 3, 1],
      ["diapers|newborn-0-3m", 3, 0],
    ]);
    expect(MIN_GAP_THIS_WEEK).toBe(3);
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
    const lunch = (label: string, tag: "insulated" | "leak-proof", matchedCount: number) =>
      item({ needLabel: label, category: "lunch-box", mustHaveTags: [tag], key: tag });
    for (let n = 0; n < 3; n++) {
      await recordLive("back_to_school", [{ item: lunch("Insulated lunch box", "insulated", 1), matchedCount: 1 }]);
      await recordLive("back_to_school", [{ item: lunch("Leak-proof lunch box", "leak-proof", 2), matchedCount: 2 }]);
      for (const c of ["tent", "rice-cooker", "office-chair"] as const)
        await recordLive("other", [{ item: item({ needLabel: c, category: c, mustHaveTags: ["compact"] }), matchedCount: 0 }]);
    }
    const r = await insights("all");
    const keys = r.gaps.map((g) => g.key);
    expect(keys).toHaveLength(8);
    expect(keys).toContain("lunch-box|insulated");
    expect(keys).not.toContain("lunch-box|leak-proof");
    expect(keys.some((k) => k.startsWith("water-bottle"))).toBe(false); // seeded rows with matchedCount ≥ 2
  });

  it("F7: a gap needs thisWeek ≥ 3 to be returned (2 sessions: hidden, 3: shown); last-week only never shows", async () => {
    makeLLM();
    const bag = item({ needLabel: "Foldable tent", category: "tent", mustHaveTags: ["waterproof"] });
    for (let n = 0; n < 2; n++) await recordLive("camping_trip", [{ item: bag, matchedCount: 0 }]);
    expect((await insights("all")).gaps.map((g) => g.key)).not.toContain("tent|waterproof");
    await recordLive("camping_trip", [{ item: bag, matchedCount: 0 }]);
    expect(gap(await insights("all"), "tent|waterproof").thisWeek).toBe(3);
  });

  it("F6: gaps count distinct sessions, not rows (two rows of one gap in one session = 1)", async () => {
    makeLLM();
    const t1 = item({ key: "t1", needLabel: "Tent A", category: "tent", mustHaveTags: ["waterproof"] });
    const t2 = item({ key: "t2", needLabel: "Tent B", category: "tent", mustHaveTags: ["waterproof"] });
    for (let n = 0; n < 3; n++)
      await recordLive("camping_trip", [
        { item: t1, matchedCount: 0 },
        { item: t2, matchedCount: 0 },
      ]);
    expect(gap(await insights("all"), "tent|waterproof").thisWeek).toBe(3); // 6 rows, 3 sessions
  });

  it("F6: every category-null row is ONE 'none|' gap labelled with the 2 most common needs", async () => {
    makeLLM();
    const mk = (label: string) => item({ key: label, needLabel: label, category: null });
    // 6 sessions with Dog food + Dog bed (more than any seeded label), 1 with Fish tank, plus a null item that carries tags
    for (let n = 0; n < 6; n++)
      await recordLive("other", [
        { item: mk("Dog food"), matchedCount: 0 },
        { item: mk("Dog bed"), matchedCount: 0 },
      ]);
    await recordLive("other", [{ item: mk("Fish tank"), matchedCount: 0 }]);
    await recordLive("other", [{ item: { ...mk("Cat tree"), mustHaveTags: ["lightweight"] }, matchedCount: 0 }]);
    const r = await insights("all");
    const none = r.gaps.filter((g) => g.category === null);
    expect(none).toHaveLength(1);
    expect(none[0]).toMatchObject({ key: "none|", tags: [], type: "assortment_gap" });
    expect(none[0].needLabel.split(", ")).toHaveLength(2);
    expect(none[0].needLabel).toBe("Not in catalog: Dog bed, Dog food"); // equal counts → alphabetical
    expect(none[0].thisWeek).toBe(3 + 6 + 1 + 1); // 3 seeded + 6 dog sessions + Fish tank + Cat tree
  });

  it("gap keys sort tags, so the same need with tags in another order is one gap", async () => {
    makeLLM();
    const tags = (t: string[]) => item({ needLabel: "Tent", category: "tent", mustHaveTags: t });
    await recordLive("camping_trip", [{ item: tags(["waterproof", "2-person"]), matchedCount: 0 }]);
    await recordLive("camping_trip", [{ item: tags(["2-person", "waterproof"]), matchedCount: 0 }]);
    await recordLive("camping_trip", [{ item: tags(["waterproof", "2-person"]), matchedCount: 0 }]);
    const g = gap(await insights("all"), "tent|2-person,waterproof");
    expect(g).toMatchObject({ thisWeek: 3, tags: ["2-person", "waterproof"] });
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

describe("GET /api/seller/insights — F4 order inside one shop", () => {
  it("shop view: listing gaps first, then assortment gaps, each by thisWeek desc; 'all' keeps thisWeek order", async () => {
    makeLLM();
    const minhan = await insights("shop-minhan");
    const types = minhan.gaps.map((g) => g.type);
    const firstAssortment = types.indexOf("assortment_gap");
    expect(types.slice(0, firstAssortment).every((t) => t === "listing_gap")).toBe(true);
    expect(types.slice(firstAssortment).every((t) => t === "assortment_gap")).toBe(true);
    expect(minhan.gaps[0].key).toBe(BACKPACK); // 8 this week, but RAINCOAT (10) is an assortment gap
    for (const group of [minhan.gaps.filter((g) => g.type === "listing_gap"), minhan.gaps.filter((g) => g.type === "assortment_gap")]) {
      const counts = group.map((g) => g.thisWeek);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    }
    const all = await insights("all");
    expect(all.gaps[0].key).toBe(RAINCOAT);
    const allCounts = all.gaps.map((g) => g.thisWeek);
    expect(allCounts).toEqual([...allCounts].sort((a, b) => b - a));
  });
});

describe("GET /api/seller/insights — F5 appliedFix survives a reload", () => {
  const call = (handler: (r: Request) => Promise<Response>, path: string, body: unknown) =>
    handler(
      new Request(`http://localhost/api/seller/enrichment/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("unfixed gaps have appliedFix null", async () => {
    makeLLM();
    const r = await insights("shop-minhan");
    for (const g of r.gaps) expect(g.appliedFix ?? null).toBeNull();
  });

  it("after apply the gap stays a listing_gap with appliedFix; after undo it is the plain listing gap again", async () => {
    makeLLM();
    const p = await (await call(previewEnrichment, "preview", { productId: "prod-minhan-backpack", gapKey: BACKPACK })).json();
    const applied = await (await call(applyEnrichment, "apply", { proposalId: p.proposalId })).json();
    const appliedAt = applied.product.updatedForDemandAt as string;
    expect(appliedAt).toBeTruthy();

    for (const shop of ["shop-minhan", "all"]) {
      const g = gap(await insights(shop), BACKPACK);
      expect(g.type).toBe("listing_gap");
      expect(g.appliedFix).toEqual({ productId: "prod-minhan-backpack", title: applied.product.title, appliedAt });
    }
    // another shop did not fix anything: its view is not "fixed"
    const kz = gap(await insights("shop-kidzone"), BACKPACK);
    expect(kz.appliedFix ?? null).toBeNull();
    // other gaps are untouched
    expect(gap(await insights("shop-minhan"), RAINCOAT).appliedFix ?? null).toBeNull();

    const undone = await call(undoEnrichment, "undo", { productId: "prod-minhan-backpack" });
    expect(undone.status).toBe(200);
    const g2 = gap(await insights("shop-minhan"), BACKPACK);
    expect(g2.appliedFix ?? null).toBeNull();
    expect(g2.type).toBe("listing_gap");
    expect(g2.candidates?.map((c) => c.productId)).toEqual(["prod-minhan-backpack"]);
  });
});

describe("GET /api/seller/insights — advice", () => {
  it("one fast-model sentence per gap, built from the gap facts", async () => {
    const { llm } = makeLLM();
    const r = await insights("all");
    expect(gap(r, BACKPACK).advice).toBe("Advice for Anti-hunchback backpack.");
    const adviceCalls = llm.calls.filter((c) => c.name === "seller_advice");
    expect(adviceCalls).toHaveLength(5);
    expect(new Set(adviceCalls.map((c) => c.model))).toEqual(new Set([models.fast()]));
    expect(llm.calls.filter((c) => c.name === "listing_fit").every((c) => c.model === models.fast())).toBe(
      true,
    );
  });

  it("cache hit does not call the LLM again; changed counts regenerate only that gap", async () => {
    const { calls } = makeLLM();
    await insights("all");
    expect(calls("seller_advice")).toBe(5);
    await insights("all");
    expect(calls("seller_advice")).toBe(5);
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
    expect(calls("seller_advice")).toBe(6);
    expect(gap(r, RAINCOAT).thisWeek).toBe(11);
  });

  it("advice is cached per gap type, so switching shops (listing ↔ assortment) does not regenerate it", async () => {
    const { calls } = makeLLM();
    await insights("shop-minhan");
    expect(calls("seller_advice")).toBe(5);
    await insights("shop-kidzone"); // backpack flips to assortment_gap → one new sentence
    expect(calls("seller_advice")).toBe(6);
    await insights("shop-minhan");
    await insights("shop-kidzone");
    expect(calls("seller_advice")).toBe(6);
  });

  it("advice failure falls back to a code sentence and is not cached", async () => {
    makeLLM({ adviceFails: true });
    const r = await insights("all");
    expect(gap(r, RAINCOAT).advice).toMatch(/10 buyers this week/);
    const { calls } = makeLLM();
    await insights("all");
    expect(calls("seller_advice")).toBe(5);
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

// Seam S7 (T07, Full) — POST /api/demand/watch stores a "Notify me" watch; insights show the waiting buyers.
describe("POST /api/demand/watch — Notify me", () => {
  const watch = (body: unknown) =>
    postWatch(
      new NextRequest("http://localhost/api/demand/watch", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    );

  it("each watch stores one more and returns the gap's count", async () => {
    const r1 = await watch({ gapKey: RAINCOAT });
    expect(r1.status).toBe(200);
    expect(DemandWatchResponseSchema.parse(await r1.json())).toEqual({ watchers: 1 });
    expect(await (await watch({ gapKey: RAINCOAT })).json()).toEqual({ watchers: 2 });
    expect(await (await watch({ gapKey: LAMP })).json()).toEqual({ watchers: 1 });
  });

  it("insights include watchers per gap (0 when nobody waits), for every shop view", async () => {
    makeLLM();
    const before = await insights("shop-minhan");
    expect(before.gaps.every((g) => g.watchers === 0)).toBe(true);
    await watch({ gapKey: RAINCOAT });
    await watch({ gapKey: RAINCOAT });
    await watch({ gapKey: BACKPACK });
    for (const shop of ["shop-minhan", "all"]) {
      const r = await insights(shop);
      expect(gap(r, RAINCOAT)).toMatchObject({ type: "assortment_gap", watchers: 2 });
      expect(gap(r, BACKPACK).watchers).toBe(1);
      expect(gap(r, LAMP).watchers).toBe(0);
      expect(gap(r, RAINCOAT).thisWeek).toBe(gap(before, RAINCOAT).thisWeek); // a watch is not demand
    }
  });

  it("a noMatch row's key (gapKeyFor its plan item) lands on the same gap, whatever the tag order", async () => {
    makeLLM();
    await watch({ gapKey: gapKeyFor("kids-raincoat", ["backpack-cover", "backpack-cover"]) });
    await watch({ gapKey: "kids-desk-lamp|anti-blue-light" });
    for (let n = 0; n < 3; n++)
      await recordLive("back_to_school", [
        { item: item({ category: "pencil-case", mustHaveTags: ["waterproof", "grade-1"] }), matchedCount: 0 },
      ]);
    expect(await (await watch({ gapKey: "pencil-case|waterproof,grade-1" })).json()).toEqual({ watchers: 1 });
    expect(await (await watch({ gapKey: "pencil-case|grade-1,waterproof" })).json()).toEqual({ watchers: 2 });
    const r = await insights("all");
    expect(gap(r, RAINCOAT).watchers).toBe(1);
    expect(gap(r, "pencil-case|grade-1,waterproof").watchers).toBe(2);
    expect(await (await watch({ gapKey: "none|" })).json()).toEqual({ watchers: 1 });
  });

  it("400 for a missing or malformed gap key (nothing stored)", async () => {
    for (const body of ["not json", {}, { gapKey: 7 }, { gapKey: "" }, { gapKey: "school-backpack" },
      { gapKey: "no-such-category|grade-1" }, { gapKey: "school-backpack|Anti Hunchback" }]) {
      const res = await watch(body);
      expect(res.status).toBe(400);
      expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("bad_request");
    }
    expect(await getAdapter().countDemandWatches(["school-backpack|", "no-such-category|grade-1"])).toEqual({
      "school-backpack|": 0,
      "no-such-category|grade-1": 0,
    });
  });
});
