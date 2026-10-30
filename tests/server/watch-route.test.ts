// POST /api/demand/watch (ticket 07, Full) through the real routes: a watch increments the gap's count and
// GET /api/seller/insights reflects it as `watchers`. In-memory adapter + watch store, FakeLLM (nothing queued).
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { InsightsResponseSchema, WatchResponseSchema } from "@/contract";
import { POST as watch } from "@/app/api/demand/watch/route";
import { GET as insights } from "@/app/api/seller/insights/route";
import { FakeLLM, setLLM } from "@/server/llm";

const RAINCOAT = "kids-raincoat|backpack-cover";
const BACKPACK = "school-backpack|anti-hunchback";

const post = (body: unknown) =>
  watch(
    new NextRequest("http://localhost/api/demand/watch", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

async function watchers(shopId = "all"): Promise<Map<string, number | undefined>> {
  setLLM(new FakeLLM());
  const res = await insights(new NextRequest(`http://localhost/api/seller/insights?shopId=${shopId}`));
  expect(res.status).toBe(200);
  const body = InsightsResponseSchema.parse(await res.json());
  return new Map(body.gaps.map((g) => [g.key, g.watchers]));
}

afterEach(() => setLLM(null));

describe("POST /api/demand/watch", () => {
  it("stores a watch and returns the gap's count, +1 per watch; insights reflect it", async () => {
    const before = (await watchers()).get(RAINCOAT)!;
    expect(before).toEqual(expect.any(Number));

    const first = await post({ gapKey: RAINCOAT });
    expect(first.status).toBe(200);
    expect(WatchResponseSchema.parse(await first.json())).toEqual({ watchers: before + 1 });
    const second = await post({ gapKey: ` ${RAINCOAT} ` });
    expect(await second.json()).toEqual({ watchers: before + 2 });

    const after = await watchers();
    expect(after.get(RAINCOAT)).toBe(before + 2);
    expect(after.get(BACKPACK)).toBe(0);
    expect((await watchers("shop-trailhead")).get(RAINCOAT)).toBe(before + 2);
  });

  it("every insights gap carries watchers (0 when nobody watches)", async () => {
    const all = await watchers();
    expect(all.size).toBeGreaterThan(0);
    for (const n of all.values()) expect(n).toEqual(expect.any(Number));
  });

  it.each([
    ["no body", "not json"],
    ["missing gapKey", {}],
    ["empty gapKey", { gapKey: "  " }],
    ["not a gap key", { gapKey: "school-backpack" }],
    ["too long", { gapKey: "a|" + "x".repeat(300) }],
  ])("400 bad_request: %s", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });
});
