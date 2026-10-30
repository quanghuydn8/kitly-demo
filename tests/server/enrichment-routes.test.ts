// POST /api/seller/enrichment/{preview,apply,undo} (seam S4 through the real routes): InMemoryAdapter + FakeLLM.
// Every test that applies also undoes, so the shared in-memory catalog is back to the seed between tests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EnrichmentPreviewResponseSchema, InsightsResponseSchema, ProductResponseSchema, type KitPlan } from "@/contract";
import { POST as preview, maxDuration } from "@/app/api/seller/enrichment/preview/route";
import { POST as apply } from "@/app/api/seller/enrichment/apply/route";
import { POST as undo } from "@/app/api/seller/enrichment/undo/route";
import { GET as insights } from "@/app/api/seller/insights/route";
import { getAdapter } from "@/server/adapter";
import { matchPlan } from "@/server/kit/matcher";
import { FakeLLM, setLLM } from "@/server/llm";
import kitSample from "@/contract/fixtures/kit.sample.json";
import { draft, SPINE } from "./support/enrichment";

const HERO_ID = "prod-minhan-backpack";
const GAP_KEY = "school-backpack|anti-hunchback";
const ORIGINAL_DESC =
  "Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only 0.75 kg. Water-resistant fabric. Sized for children aged 6–8.";

const post = (handler: (r: NextRequest) => Promise<Response>, path: string, body: unknown) =>
  handler(
    new NextRequest(`http://localhost/api/seller/enrichment/${path}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

async function previewHero(answer: unknown = draft()) {
  setLLM(new FakeLLM({ structured: [answer] }));
  const res = await post(preview, "preview", { productId: HERO_ID, gapKey: GAP_KEY });
  expect(res.status).toBe(200);
  return EnrichmentPreviewResponseSchema.parse(await res.json());
}
const applyToken = (proposalId: string) => post(apply, "apply", { proposalId });
const undoHero = () => post(undo, "undo", { productId: HERO_ID });

async function heroGap() {
  setLLM(new FakeLLM()); // nothing queued: judgements = not supported, advice = code fallback
  const res = await insights(new NextRequest("http://localhost/api/seller/insights?shopId=shop-minhan"));
  return InsightsResponseSchema.parse(await res.json()).gaps.find((g) => g.key === GAP_KEY)!;
}
const heroPlan = (): KitPlan =>
  structuredClone((kitSample as { event: string; data: { plan?: KitPlan } }[]).find((e) => e.event === "plan")!.data.plan!);
async function heroBackpackCandidates() {
  const adapter = getAdapter();
  const r = await matchPlan(adapter, heroPlan(), { shops: await adapter.listShops(), today: "2026-09-02" });
  return (r.candidates.backpack ?? []).map((c) => c.product.id);
}

afterEach(() => {
  setLLM(null);
  vi.useRealTimers();
});

describe("POST /api/seller/enrichment/preview", () => {
  it("exports maxDuration 300", () => {
    expect(maxDuration).toBe(300);
  });

  it("returns before/after/added/kept/keywordCheck/evidence and writes nothing", async () => {
    const before = await getAdapter().getProduct(HERO_ID);
    const body = await previewHero();
    expect(body.before).toEqual(before);
    expect(body.after.title).toBe("Minh An Kids Backpack New Model 2026 | Anti-hunchback, Lightweight, Grade 1");
    expect(body.after.tags).toEqual(["kids", "anti-hunchback", "lightweight", "grade-1"]);
    expect(body.after.attributes).toEqual({ material: "polyester", weight: "0.75 kg" });
    expect(body.after.description).toBe(ORIGINAL_DESC);
    expect(body.added).toEqual({
      titleSuffix: "Anti-hunchback, Lightweight, Grade 1",
      tags: ["anti-hunchback", "lightweight", "grade-1"],
      attributes: { weight: "0.75 kg" },
      descriptionAppend: "",
    });
    expect(body.kept).toEqual({ title: "Minh An Kids Backpack New Model 2026", tags: ["kids"] });
    expect(body.keywordCheck.length).toBeGreaterThan(0);
    expect(body.keywordCheck.every((k) => k.stillMatches)).toBe(true);
    expect(body.evidence).toBe(SPINE);
    expect(await getAdapter().getProduct(HERO_ID)).toEqual(before);
  });

  it("a descriptionAppend that repeats the description leaves it unchanged (no blank lines, no repeat)", async () => {
    const body = await previewHero(draft({ descriptionAppend: "Weighs only 0.75 kg. Water-resistant fabric." }));
    expect(body.after.description).toBe(ORIGINAL_DESC);
    expect(body.added.descriptionAppend).toBe("");
  });

  it("drops LLM tags that the listing cannot quote", async () => {
    const body = await previewHero(
      draft({ tags: [{ tag: "anti-hunchback", evidence: SPINE }, { tag: "waterproof", evidence: "100% waterproof shell" }] }),
    );
    expect(body.added.tags).toEqual(["anti-hunchback"]);
  });

  it("errors: bad body 400, unknown product 404, gap of another category 400, LLM failure 502", async () => {
    setLLM(new FakeLLM({ structured: [new Error("proxy down")] }));
    expect((await post(preview, "preview", "{")).status).toBe(400);
    expect((await post(preview, "preview", { productId: "nope", gapKey: GAP_KEY })).status).toBe(404);
    expect((await post(preview, "preview", { productId: HERO_ID, gapKey: "kids-raincoat|backpack-cover" })).status).toBe(400);
    expect((await post(preview, "preview", { productId: HERO_ID, gapKey: "none|" })).status).toBe(400);
    const res = await post(preview, "preview", { productId: HERO_ID, gapKey: GAP_KEY });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("llm_error");
  });
});

describe("apply / undo", () => {
  it("apply → Matcher finds the hero backpack + insights appliedFix; undo (later) → exact previous listing, badge cleared; 2nd undo 404", async () => {
    const original = await getAdapter().getProduct(HERO_ID);
    expect(await heroBackpackCandidates()).not.toContain(HERO_ID);
    expect((await heroGap()).appliedFix).toBeNull();

    const { proposalId, after } = await previewHero();
    const res = await applyToken(proposalId);
    expect(res.status).toBe(200);
    const { product } = ProductResponseSchema.parse(await res.json());
    expect({ ...product, updatedForDemandAt: null }).toEqual({ ...after, updatedForDemandAt: null });
    expect(product.updatedForDemandAt).toMatch(/^2026-09-02T/);
    expect(await heroBackpackCandidates()).toContain(HERO_ID);

    for (let reload = 0; reload < 2; reload++) {
      expect((await heroGap()).appliedFix).toEqual({ productId: HERO_ID, title: after.title, appliedAt: product.updatedForDemandAt });
    }

    const u = await undoHero();
    expect(u.status).toBe(200);
    expect(ProductResponseSchema.parse(await u.json()).product).toEqual(original);
    expect(await getAdapter().getProduct(HERO_ID)).toEqual(original);
    expect((await heroGap()).appliedFix).toBeNull();
    expect(await heroBackpackCandidates()).not.toContain(HERO_ID);

    const again = await undoHero();
    expect(again.status).toBe(404);
    expect((await post(undo, "undo", {})).status).toBe(400);
  });

  it("the same token twice → second 404; tampered / unknown token → 404; listing changed since preview → 409", async () => {
    const { proposalId } = await previewHero();
    const [body, sig] = proposalId.split(".");
    expect((await applyToken(`${body}x.${sig}`)).status).toBe(404);
    expect((await applyToken("not-a-token")).status).toBe(404);
    expect((await post(apply, "apply", { nope: 1 })).status).toBe(400);

    expect((await applyToken(proposalId)).status).toBe(200);
    const second = await applyToken(proposalId);
    expect(second.status).toBe(404);
    expect((await second.json()).error.code).toBe("not_found");
    expect((await undoHero()).status).toBe(200);

    const stale = await previewHero();
    await getAdapter().updateListing(HERO_ID, { ...stale.before, title: "Edited by the seller" });
    expect((await applyToken(stale.proposalId)).status).toBe(409);
    expect((await undoHero()).status).toBe(200);
  });

  it("an expired proposal (> 30 min) → 404", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
    const { proposalId } = await previewHero();
    vi.setSystemTime(new Date("2026-10-30T10:30:01Z"));
    expect((await applyToken(proposalId)).status).toBe(404);
    expect((await getAdapter().getProduct(HERO_ID))!.updatedForDemandAt).toBeNull();
  });

  it("serverless-safe: preview → all in-memory module state cleared → apply on a fresh instance still succeeds", async () => {
    const { proposalId } = await previewHero();
    vi.resetModules(); // a different "instance": fresh adapter, fresh route modules, no shared memory
    const fresh = await import("@/app/api/seller/enrichment/apply/route");
    const res = await post(fresh.POST, "apply", { proposalId });
    expect(res.status).toBe(200);
    expect(ProductResponseSchema.parse(await res.json()).product.tags).toContain("anti-hunchback");
  });
});
