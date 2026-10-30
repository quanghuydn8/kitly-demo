// GET /api/seller/insights (seam S3 through the real route): In-memory adapter + FakeLLM, live kit runs via POST /api/kit.
// LLM calls the insights route makes here have nothing queued → judgements = not supported, advice = code fallback.
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { InsightsResponseSchema } from "@/contract";
import { GET, maxDuration } from "@/app/api/seller/insights/route";
import { POST as newKit } from "@/app/api/kit/route";
import { FakeLLM, setLLM } from "@/server/llm";
import { HERO, sloppyHeroPlan } from "./support/plans";

const insights = (shopId?: string) =>
  GET(new NextRequest(`http://localhost/api/seller/insights${shopId ? `?shopId=${shopId}` : ""}`));

async function load(shopId = "shop-trailhead") {
  setLLM(new FakeLLM());
  const res = await insights(shopId);
  expect(res.status).toBe(200);
  return InsightsResponseSchema.parse(await res.json());
}

async function liveKit(query: string, plan: unknown) {
  setLLM(new FakeLLM({ structured: [plan], stream: ["Your kit."] }));
  const res = await newKit(
    new NextRequest("http://localhost/api/kit", {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: { "content-type": "application/json", cookie: "kitly_uid=owner-insights" },
    }),
  );
  await res.text();
}

const backpackThisWeek = async () =>
  (await load()).gaps.find((g) => g.key === "school-backpack|anti-hunchback")!.thisWeek;

afterEach(() => setLLM(null));

describe("GET /api/seller/insights", () => {
  it("exports maxDuration 300", () => {
    expect(maxDuration).toBe(300);
  });

  it("returns the contract shape; missing shopId = all", async () => {
    setLLM(new FakeLLM());
    const res = await insights();
    expect(res.status).toBe(200);
    const body = InsightsResponseSchema.parse(await res.json());
    expect(body.window.today).toBe("2026-09-02");
    expect(body.gaps.every((g) => g.appliedFix === null)).toBe(true);
  });

  it("unknown shop → 404 not_found", async () => {
    setLLM(new FakeLLM());
    const res = await insights("shop-nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("a live kit run increments the matching gap's thisWeek by 1", async () => {
    const before = await backpackThisWeek();
    await liveKit(HERO, sloppyHeroPlan());
    expect(await backpackThisWeek()).toBe(before + 1);
  });

  it("recent[0] is a live run's off-coverage item even though its gap is below the threshold", async () => {
    const plan = {
      ...sloppyHeroPlan(),
      items: [
        {
          key: "reef-bottle",
          needLabel: "Reef-safe water bottle",
          category: "water-bottle",
          required: true,
          quantity: 1,
          mustHaveTags: ["reef-safe"],
          niceToHaveTags: [],
          maxUnitPrice: null,
        },
      ],
    };
    await liveKit("A reef-safe water bottle for my kid", plan);
    const body = await load();
    expect(body.recent[0]).toMatchObject({ needLabel: "Reef-safe water bottle", category: "water-bottle", tags: ["reef-safe"] });
    expect(body.gaps.find((g) => g.key === "water-bottle|reef-safe")).toBeUndefined();
  });
});
