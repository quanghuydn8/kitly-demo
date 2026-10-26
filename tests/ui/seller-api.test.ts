// Seam: the seller screen's client API (src/lib/client/seller-api.ts) talking to the REAL route handlers
// (InMemoryAdapter + FakeLLM) through an in-process fetch: insights, preview → apply → undo, notify-me, errors.
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetAdapterForTests, getAdapter } from "@/server/adapter";
import { FakeLLM, setLLMForTests, type LLMMessage } from "@/server/llm";
import { resetInsightsCacheForTests } from "@/server/insights";
import { GET as getInsights } from "@/app/api/seller/insights/route";
import { GET as getShops } from "@/app/api/shops/route";
import { POST as postPreview } from "@/app/api/seller/enrichment/preview/route";
import { POST as postApply } from "@/app/api/seller/enrichment/apply/route";
import { POST as postUndo } from "@/app/api/seller/enrichment/undo/route";
import { POST as postWatch } from "@/app/api/demand/watch/route";
import { ApiCallError, sellerApi } from "@/lib/client/seller-api";

const HERO = "prod-minhan-backpack";
const BACKPACK = "school-backpack|anti-hunchback";
const RAINCOAT = "kids-raincoat|backpack-cover";

const userText = (m: LLMMessage[]) =>
  m
    .filter((x) => x.role === "user")
    .map((x) => x.content)
    .join("\n");

function useLLM() {
  setLLMForTests(
    new FakeLLM({
      respond: ({ name, messages }) => {
        const text = userText(messages);
        if (name === "listing_fit") {
          const hero = text.includes("Minh An Kids Backpack New Model 2026");
          return hero
            ? { supports: true, evidence: "S-shaped straps that keep the spine straight" }
            : { supports: false, evidence: "" };
        }
        if (name === "seller_advice") return { advice: "Say it in the listing." };
        if (name === "listing_enrichment")
          return {
            titleSuffix: "Anti-Hunchback, Lightweight",
            tags: [
              { tag: "anti-hunchback", evidence: "S-shaped straps that keep the spine straight" },
              { tag: "lightweight", evidence: "Weighs only 0.75 kg" },
            ],
            attributes: [{ name: "weight", value: "0.75 kg" }],
            descriptionAppend: "Anti-hunchback back panel.",
          };
        throw new Error(`unexpected ${name}`);
      },
    }),
  );
}

/** fetch → the app's own route handlers, so the client is exercised against the real server code. */
const routes: Record<string, (r: NextRequest) => Promise<Response>> = {
  "GET /api/seller/insights": (r) => getInsights(r),
  "GET /api/shops": () => getShops(),
  "POST /api/seller/enrichment/preview": (r) => postPreview(r),
  "POST /api/seller/enrichment/apply": (r) => postApply(r),
  "POST /api/seller/enrichment/undo": (r) => postUndo(r),
  "POST /api/demand/watch": (r) => postWatch(r),
};
const calls: string[] = [];
const inProcessFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new NextRequest(new URL(String(input), "http://localhost"), init as never);
  const route = `${req.method} ${req.nextUrl.pathname}`;
  calls.push(`${route}${req.nextUrl.search}`);
  const h = routes[route];
  if (!h) return new Response("not found", { status: 404 });
  return h(req);
}) as typeof fetch;

const api = sellerApi(inProcessFetch);

beforeEach(() => {
  resetAdapterForTests();
  resetInsightsCacheForTests();
  useLLM();
  calls.length = 0;
});

describe("sellerApi", () => {
  it("lists shops and loads validated insights for one shop or all shops", async () => {
    const shops = await api.shops();
    expect(shops.map((s) => s.id)).toContain("shop-minhan");

    const mine = await api.insights("shop-minhan");
    expect(calls).toContain("GET /api/seller/insights?shopId=shop-minhan");
    const backpack = mine.gaps.find((g) => g.key === BACKPACK)!;
    expect(backpack.type).toBe("listing_gap");
    expect(backpack.candidates?.[0]?.productId).toBe(HERO);
    expect(mine.gaps.find((g) => g.key === RAINCOAT)?.type).toBe("assortment_gap");

    const all = await api.insights("all");
    expect(all.gaps.length).toBeGreaterThan(0);
  });

  it("previews, applies and undoes a listing fix", async () => {
    const original = (await getAdapter().getProduct(HERO))!;
    const p = await api.preview(HERO, BACKPACK);
    expect(p.added.tags).toEqual(["anti-hunchback", "lightweight"]);
    expect(p.kept.tags).toEqual(original.tags);

    const applied = await api.apply(p.proposalId);
    expect(applied.updatedForDemandAt).not.toBeNull();
    expect(applied.tags).toContain("anti-hunchback");

    const undone = await api.undo(HERO);
    expect(undone).toEqual(original);
  });

  it("surfaces the server's error code and message", async () => {
    const err = await api.undo(HERO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiCallError);
    expect((err as ApiCallError).status).toBe(404);
    expect((err as ApiCallError).code).toBe("not_found");

    const bad = await api.insights("shop-nope").catch((e: unknown) => e);
    expect((bad as ApiCallError).status).toBe(404);
  });

  it("registers a buyer watch and returns the new count", async () => {
    expect(await api.watch(RAINCOAT)).toBe(1);
    expect(await api.watch(RAINCOAT)).toBe(2);
    const ins = await api.insights("shop-minhan");
    expect(ins.gaps.find((g) => g.key === RAINCOAT)?.watchers).toBe(2);
  });
});
