// POST /api/kit/price (S9 through the route) + GET /api/threads, /api/threads/:id (S6 owner isolation), on the
// In-memory adapter/KitStore. Version 1 comes from the real POST /api/kit route with a FakeLLM planner.
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as newKit } from "@/app/api/kit/route";
import { POST as price } from "@/app/api/kit/price/route";
import { GET as listThreads } from "@/app/api/threads/route";
import { GET as getThread } from "@/app/api/threads/[id]/route";
import { PriceResponseSchema, ThreadResponseSchema, ThreadsResponseSchema } from "@/contract";
import { getKitStore } from "@/server/kitstore";
import { FakeLLM, setLLM } from "@/server/llm";
import { HERO, sloppyHeroPlan } from "./support/plans";
import { dataOf, sseEvents } from "./support/sse";

const OWNER = "owner-price";
const cookieOf = (o: string) => `kitly_uid=${o}`;
function req(path: string, body?: unknown, owner = OWNER) {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: cookieOf(owner) },
  });
}

async function heroThread(plan: object = sloppyHeroPlan(), owner = OWNER) {
  setLLM(new FakeLLM({ structured: [plan], stream: ["Version one."] }));
  const evs = await sseEvents(await newKit(req("/api/kit", { query: HERO }, owner)));
  return dataOf(evs, "done").threadId;
}

async function runPrice(threadId: string, selection: object, owner = OWNER) {
  const llm = new FakeLLM();
  setLLM(llm);
  const res = await price(req("/api/kit/price", { threadId, selection }, owner));
  expect(llm.calls).toEqual([]);
  return { res, body: await res.json() };
}

afterEach(() => setLLM(null));

describe("POST /api/kit/price", () => {
  it("re-prices the selection, saves it on the latest version (no new version)", async () => {
    const threadId = await heroThread();
    const selection = {
      profile: "balanced",
      picks: { shoes: "prod-kidzone-shoes", backpack: "prod-minhan-backpack" },
      dropped: ["lunch-box"],
    };
    const { res, body } = await runPrice(threadId, selection);
    expect(res.status).toBe(200);
    const { option } = PriceResponseSchema.parse(body);
    expect(option.profile).toBe("balanced");
    expect(option.lines.find((l) => l.itemKey === "shoes")!.product.id).toBe("prod-kidzone-shoes");
    expect(option.lines.find((l) => l.itemKey === "backpack")!.product.id).toBe("prod-minhan-backpack");
    expect(option.lines.some((l) => l.itemKey === "lunch-box")).toBe(false);
    expect(option.itemsTotal + option.shippingTotal - option.discountTotal).toBe(option.grandTotal);

    const t = (await getKitStore().getThread(threadId, OWNER))!;
    expect(t.versions).toHaveLength(1);
    expect(t.versions[0].selection).toEqual(selection);
  });

  it("a product that is not a candidate, an alternative or the closest of that item → 400, nothing saved", async () => {
    const threadId = await heroThread();
    const { res, body } = await runPrice(threadId, {
      profile: "saver",
      picks: { shoes: "prod-kidzone-bottle" },
      dropped: [],
    });
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_selection");
    expect((await getKitStore().getThread(threadId, OWNER))!.versions[0].selection).toBeNull();
  });

  it("over budget ⇒ over_budget + overBy + fit", async () => {
    const threadId = await heroThread(sloppyHeroPlan({ budget: 700_000 }));
    const { body } = await runPrice(threadId, {
      profile: "saver",
      picks: { shoes: "prod-kidzone-shoes", "water-bottle": "prod-kidzone-bottle", backpack: "prod-minhan-backpack" },
      dropped: [],
    });
    const { option } = PriceResponseSchema.parse(body);
    expect(option.status).toBe("over_budget");
    expect(option.overBy).toBe(option.grandTotal - 700_000);
    expect(option.fit!.length).toBeGreaterThanOrEqual(1);
  });

  it("other owner / unknown thread → 404; bad body → 400; awaiting_budget → 409", async () => {
    const threadId = await heroThread();
    const ok = { profile: "saver", picks: {}, dropped: [] };
    expect((await runPrice(threadId, ok, "someone-else")).res.status).toBe(404);
    expect((await runPrice("nope", ok)).res.status).toBe(404);
    expect((await runPrice(threadId, { profile: "cheapest", picks: {}, dropped: [] })).res.status).toBe(400);
    const waiting = await heroThread(sloppyHeroPlan({ budget: null }));
    expect((await runPrice(waiting, ok)).res.status).toBe(409);
  });

  it("answers in < 100 ms on the in-memory store", async () => {
    const threadId = await heroThread();
    await runPrice(threadId, { profile: "premium", picks: {}, dropped: [] }); // warm-up
    const t0 = performance.now();
    await runPrice(threadId, { profile: "balanced", picks: { shoes: "prod-kidzone-shoes" }, dropped: [] });
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe("GET /api/threads, /api/threads/:id", () => {
  it("lists only the caller's threads, newest first; loads one with versions + messages; other owner → 404", async () => {
    const owner = `owner-threads-${Math.random()}`;
    const a = await heroThread(sloppyHeroPlan(), owner);
    const b = await heroThread(sloppyHeroPlan({ budget: null }), owner);
    await heroThread(sloppyHeroPlan(), "owner-other");

    const list = ThreadsResponseSchema.parse(await (await listThreads(req("/api/threads", undefined, owner))).json());
    expect(list.threads.map((t) => t.id)).toEqual([b, a]);
    expect(list.threads[0]).toMatchObject({ versionCount: 1, persona: "lan", title: HERO.slice(0, 60).trimEnd() });

    const res = await getThread(req(`/api/threads/${a}`, undefined, owner), { params: Promise.resolve({ id: a }) });
    expect(res.status).toBe(200);
    const one = ThreadResponseSchema.parse(await res.json());
    expect(one.thread.id).toBe(a);
    expect(one.versions.map((v) => v.version)).toEqual([1]);
    expect(one.messages).toEqual([]);

    const other = await getThread(req(`/api/threads/${a}`, undefined, "owner-other"), {
      params: Promise.resolve({ id: a }),
    });
    expect(other.status).toBe(404);
    expect((await other.json()).error.code).toBe("not_found");
    const none = await listThreads(req("/api/threads", undefined, `nobody-${Math.random()}`));
    expect(await none.json()).toEqual({ threads: [] });
  });
});
