// Seam S4 (adapter half) — POST /api/seller/enrichment/{preview,apply,undo} with the InMemoryAdapter + FakeLLM:
// evidence-checked proposal, additive preview, apply through the adapter (badge), exact undo, the loop closing.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  EnrichmentPreviewResponseSchema,
  ProductResponseSchema,
  type EnrichmentPreviewResponse,
  type KitPlan,
} from "@/contract";
import { kitSample } from "@/contract/fixtures";
import { getAdapter, resetAdapterForTests } from "@/server/adapter";
import { resetProposalsForTests, setEnrichmentClockForTests } from "@/server/enrichment";
import { matchPlan } from "@/server/kit/matcher";
import { FakeLLM, models, setLLMForTests } from "@/server/llm";
import { today } from "@/server/today";
import { POST as preview } from "@/app/api/seller/enrichment/preview/route";
import { POST as apply } from "@/app/api/seller/enrichment/apply/route";
import { POST as undo } from "@/app/api/seller/enrichment/undo/route";

const HERO = "prod-minhan-backpack";
const GAP = "school-backpack|anti-hunchback";
const HERO_PLAN: KitPlan = kitSample.flatMap((e) => (e.event === "plan" ? [e.data.plan] : []))[0];

const draft = (over: Record<string, unknown> = {}) => ({
  titleSuffix: "Anti-Hunchback, Lightweight, Grade 1",
  tags: [
    { tag: "anti-hunchback", evidence: "S-shaped straps that keep the spine straight" },
    { tag: "lightweight", evidence: "Weighs only 0.75 kg" },
    { tag: "grade-1", evidence: "Sized for children aged 6–8" },
  ],
  attributes: [
    { name: "weight", value: "0.75 kg" },
    { name: "material", value: "nylon" },
  ],
  descriptionAppend: "Anti-hunchback back panel, suitable for Grade 1.",
  ...over,
});

let llm: FakeLLM;
const useLLM = (structured: unknown[]) => {
  llm = new FakeLLM({ structured });
  setLLMForTests(llm);
};

const call = (handler: (r: Request) => Promise<Response>, path: string, body: unknown) =>
  handler(
    new Request(`http://localhost/api/seller/enrichment/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

async function ok<T>(res: Response, schema: { parse: (v: unknown) => T }): Promise<T> {
  expect(res.status).toBe(200);
  return schema.parse(await res.json());
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status);
  return ApiErrorSchema.parse(await res.json()).error.code;
}

const previewHero = async (): Promise<EnrichmentPreviewResponse> =>
  ok(await call(preview, "preview", { productId: HERO, gapKey: GAP }), EnrichmentPreviewResponseSchema);

let clock = 1_000_000;
beforeEach(() => {
  process.env.KITLY_ADAPTER = "memory";
  resetAdapterForTests();
  resetProposalsForTests();
  clock = 1_000_000;
  setEnrichmentClockForTests(() => clock);
  useLLM([draft()]);
});
afterEach(() => {
  setLLMForTests(null);
  setEnrichmentClockForTests(null);
});

describe("POST /api/seller/enrichment/preview", () => {
  it("returns an additive proposal: original title + suffix, gap tags added, kept parts, all keywords still match", async () => {
    const before = (await getAdapter().getProduct(HERO))!;
    const p = await previewHero();
    expect(p.before).toEqual(before);
    expect(p.after.title).toBe(`${before.title} | Anti-Hunchback, Lightweight, Grade 1`);
    expect(p.added.titleSuffix).toBe("Anti-Hunchback, Lightweight, Grade 1");
    expect(p.added.tags).toEqual(["anti-hunchback", "lightweight", "grade-1"]);
    expect(p.after.tags).toEqual(["kids", "anti-hunchback", "lightweight", "grade-1"]);
    // existing attribute "material" is never overwritten → only weight is added
    expect(p.added.attributes).toEqual({ weight: "0.75 kg" });
    expect(p.after.attributes).toEqual({ material: "polyester", weight: "0.75 kg" });
    expect(p.after.description).toBe(
      `${before.description}\n\nAnti-hunchback back panel, suitable for Grade 1.`,
    );
    expect(p.added.descriptionAppend).toBe("Anti-hunchback back panel, suitable for Grade 1.");
    expect(p.kept).toEqual({ title: before.title, tags: ["kids"] });
    expect(p.keywordCheck.length).toBeGreaterThan(0);
    expect(p.keywordCheck.every((k) => k.stillMatches)).toBe(true);
    expect(p.evidence).toContain("S-shaped straps that keep the spine straight");
    expect(p.proposalId).toBeTruthy();
    // preview changes nothing yet
    expect(await getAdapter().getProduct(HERO)).toEqual(before);
  });

  it("drafts on the fast model with the listing and the gap tags in the prompt", async () => {
    await previewHero();
    expect(llm.calls).toHaveLength(1);
    const c = llm.calls[0];
    expect(c.model).toBe(models.fast());
    expect(c.name).toBe("listing_enrichment");
    const user = c.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    expect(user).toContain("Padded ergonomic back panel");
    expect(user).toContain("anti-hunchback");
  });

  it("drops tags whose evidence is not a verbatim quote, unknown tags and tags the listing already has", async () => {
    useLLM([
      draft({
        tags: [
          { tag: "anti-hunchback", evidence: "S-shaped straps that keep the spine straight." },
          { tag: "waterproof", evidence: "Fully waterproof, survives a storm" }, // fabricated quote
          { tag: "grade-1", evidence: "" }, // no evidence
          { tag: "kids", evidence: "Sized for children aged 6–8" }, // already on the listing
          { tag: "super-strong", evidence: "Weighs only 0.75 kg" }, // not a canonical tag
        ],
      }),
    ]);
    const p = await previewHero();
    expect(p.added.tags).toEqual(["anti-hunchback"]);
    expect(p.after.tags).toEqual(["kids", "anti-hunchback"]);
    expect(p.evidence).toBe("S-shaped straps that keep the spine straight");
  });

  it("F13: description append keeps only information NOT already in the description", async () => {
    useLLM([
      draft({
        descriptionAppend:
          "Water-resistant fabric, weighs only 0.75 kg. Comes with a detachable rain cover for wet days.",
      }),
    ]);
    const p = await previewHero();
    expect(p.added.descriptionAppend).toBe("Comes with a detachable rain cover for wet days.");
    expect(p.after.description).toBe(`${p.before.description}\n\nComes with a detachable rain cover for wet days.`);
  });

  it("F13: when the append says nothing new, nothing is appended", async () => {
    useLLM([
      draft({ descriptionAppend: "Padded ergonomic back panel with S-shaped straps that keep the spine straight. Sized for children aged 6–8." }),
    ]);
    const p = await previewHero();
    expect(p.added.descriptionAppend).toBe("");
    expect(p.after.description).toBe(p.before.description);
  });

  it("F13: the drafting prompt says to add only new information", async () => {
    await previewHero();
    const system = llm.calls[0].messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    expect(system).toMatch(/not already in the description/i);
    expect(system).toMatch(/empty string/i);
  });

  it("400 on a bad body or a gap of another category, 404 on an unknown product, no model call", async () => {
    expect(await errorCode(await call(preview, "preview", "{nope"), 400)).toBe("bad_request");
    expect(await errorCode(await call(preview, "preview", { productId: HERO }), 400)).toBe("bad_request");
    expect(
      await errorCode(
        await call(preview, "preview", { productId: HERO, gapKey: "kids-raincoat|backpack-cover" }),
        400,
      ),
    ).toBe("bad_request");
    expect(
      await errorCode(await call(preview, "preview", { productId: "prod-nope", gapKey: GAP }), 404),
    ).toBe("not_found");
    expect(llm.calls).toHaveLength(0);
  });

  it("502 llm_error when the model fails", async () => {
    useLLM([]); // FakeLLM throws: nothing queued
    expect(await errorCode(await call(preview, "preview", { productId: HERO, gapKey: GAP }), 502)).toBe(
      "llm_error",
    );
  });
});

describe("apply + undo", () => {
  it("apply writes the previewed listing through the adapter and sets the badge; the hero query now finds it", async () => {
    const backpack = HERO_PLAN.items.find((i) => i.key === "backpack")!;
    const beforeMatch = await matchPlan(getAdapter(), HERO_PLAN, today());
    expect(beforeMatch.byItem.backpack.candidates.map((c) => c.product.id)).not.toContain(HERO);

    const p = await previewHero();
    const { product } = await ok(
      await call(apply, "apply", { proposalId: p.proposalId }),
      ProductResponseSchema,
    );
    expect({ ...product, updatedForDemandAt: null }).toEqual(p.after);
    expect(product.updatedForDemandAt?.slice(0, 10)).toBe(today());
    expect(await getAdapter().getProduct(HERO)).toEqual(product);

    const afterMatch = await matchPlan(getAdapter(), HERO_PLAN, today());
    const ids = afterMatch.byItem[backpack.key].candidates.map((c) => c.product.id);
    expect(ids).toContain(HERO);
    expect(afterMatch.byItem.backpack.reason).toBeNull();
  });

  it("undo restores the exact previous listing (badge cleared); a second undo is 404", async () => {
    const before = (await getAdapter().getProduct(HERO))!;
    const p = await previewHero();
    await ok(await call(apply, "apply", { proposalId: p.proposalId }), ProductResponseSchema);
    const { product } = await ok(await call(undo, "undo", { productId: HERO }), ProductResponseSchema);
    expect(product).toEqual(before);
    expect(product.updatedForDemandAt).toBeNull();
    expect(await getAdapter().getProduct(HERO)).toEqual(before);
    expect(await errorCode(await call(undo, "undo", { productId: HERO }), 404)).toBe("not_found");
  });

  it("undo with nothing to undo → 404; bad body → 400", async () => {
    expect(await errorCode(await call(undo, "undo", { productId: HERO }), 404)).toBe("not_found");
    expect(await errorCode(await call(undo, "undo", {}), 400)).toBe("bad_request");
  });

  it("unknown, already-used or expired (> 30 min) proposalId → 404", async () => {
    expect(await errorCode(await call(apply, "apply", { proposalId: "nope" }), 404)).toBe("not_found");
    expect(await errorCode(await call(apply, "apply", {}), 400)).toBe("bad_request");

    const used = await previewHero();
    await ok(await call(apply, "apply", { proposalId: used.proposalId }), ProductResponseSchema);
    expect(await errorCode(await call(apply, "apply", { proposalId: used.proposalId }), 404)).toBe(
      "not_found",
    );
    await call(undo, "undo", { productId: HERO });

    useLLM([draft()]);
    const stale = await previewHero();
    clock += 30 * 60 * 1000 + 1;
    expect(await errorCode(await call(apply, "apply", { proposalId: stale.proposalId }), 404)).toBe(
      "not_found",
    );
    expect((await getAdapter().getProduct(HERO))!.updatedForDemandAt).toBeNull();
  });

  it("a proposal is still valid just under 30 min", async () => {
    const p = await previewHero();
    clock += 30 * 60 * 1000 - 1;
    await ok(await call(apply, "apply", { proposalId: p.proposalId }), ProductResponseSchema);
  });

  it("409 conflict when the listing changed after the preview (nothing written)", async () => {
    const p = await previewHero();
    const edited = await getAdapter().updateListing(HERO, {
      title: "Seller edit",
      description: "x",
      tags: [],
      attributes: {},
    });
    expect(await errorCode(await call(apply, "apply", { proposalId: p.proposalId }), 409)).toBe("conflict");
    expect(await getAdapter().getProduct(HERO)).toEqual(edited);
  });
});
