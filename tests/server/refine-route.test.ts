// POST /api/kit/refine (seam S6): the real route handlers (POST /api/kit then /api/kit/refine) on the In-memory
// adapter/KitStore + FakeLLM. A refine = a new version of the same thread; it records an intent session, never demand.
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as newKit } from "@/app/api/kit/route";
import { POST as refine, maxDuration } from "@/app/api/kit/refine/route";
import { getAdapter } from "@/server/adapter";
import type { InMemoryAdapter } from "@/server/adapter/in-memory";
import { getKitStore } from "@/server/kitstore";
import { FakeLLM, setLLM } from "@/server/llm";
import { HERO, heroWithout, puppyPlan, refineOutput, sloppyHeroPlan } from "./support/plans";
import { dataOf, eventNames, sseEvents } from "./support/sse";

const OWNER = "owner-refine";
const MSG = "Remove the uniform, budget 1M";
function post(path: string, body: unknown, cookie = `kitly_uid=${OWNER}`) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie },
  });
}

/** Version 1 of a hero thread (POST /api/kit), then returns its ids. */
async function heroThread(first: object = sloppyHeroPlan(), cookie?: string) {
  setLLM(new FakeLLM({ structured: [first], stream: ["Version one."] }));
  const evs = await sseEvents(await newKit(post("/api/kit", { query: HERO }, cookie)));
  const done = dataOf(evs, "done");
  return { threadId: done.threadId, sessionId: done.sessionId };
}

async function runRefine(
  threadId: string,
  output: object,
  message = MSG,
  stream: string[] = ["Removed the uniform. ", "New total fits 1M."],
) {
  const llm = new FakeLLM({ structured: [output], stream });
  setLLM(llm);
  const res = await refine(post("/api/kit/refine", { threadId, message }));
  return { llm, res, evs: await sseEvents(res) };
}

afterEach(() => setLLM(null));

describe("POST /api/kit/refine: remove uniform + budget 1M", () => {
  it("streams the kit events with plan.diff, saves version 2 (kind refine), version 1 unchanged", async () => {
    const { threadId } = await heroThread();
    const before = (await getKitStore().getThread(threadId, OWNER))!.versions[0];
    const { evs } = await runRefine(threadId, refineOutput(heroWithout(["uniform"], { budget: 1_000_000 })));
    expect(eventNames(evs).filter((n) => n !== "explanation")).toEqual([
      "understand:running",
      "understand:done",
      "plan:running",
      "plan",
      "plan:done",
      "search:running",
      "search:done",
      "optimize:running",
      "optimize:done",
      "options",
      "explain:running",
      "explain:done",
      "done",
    ]);
    const plan = dataOf(evs, "plan");
    expect(plan).toMatchObject({ threadId, version: 2, diff: { added: [], removed: ["uniform"], changed: [] } });
    expect(plan.plan.budget).toBe(1_000_000);
    const { options } = dataOf(evs, "options");
    expect(options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
    for (const o of options) {
      expect(o.status).toBe("ok");
      expect(o.grandTotal).toBeLessThanOrEqual(1_000_000);
      expect(o.lines.map((l) => l.itemKey)).not.toContain("uniform");
    }
    expect(dataOf(evs, "done")).toEqual({ sessionId: plan.sessionId, threadId, version: 2 });

    const t = (await getKitStore().getThread(threadId, OWNER))!;
    expect(t.thread.versionCount).toBe(2);
    expect(t.versions[0]).toEqual(before);
    expect(t.versions[1]).toMatchObject({
      version: 2,
      kind: "refine",
      userText: MSG,
      status: "ready",
      excludedKeys: [],
      diff: { added: [], removed: ["uniform"], changed: [] },
      selection: null,
      followUp: null,
      explanation: "Removed the uniform. New total fits 1M.",
    });
    expect(t.versions[1].plan).toEqual(plan.plan);
    expect(t.versions[1].options).toEqual(options);
  });

  it("the planner gets the previous plan + message; the explainer gets what changed and the new total", async () => {
    const { threadId } = await heroThread();
    const prev = (await getKitStore().getThread(threadId, OWNER))!.versions[0].plan;
    const { llm, evs } = await runRefine(threadId, refineOutput(heroWithout(["uniform"], { budget: 1_000_000 })));
    const planner = llm.calls.find((c) => c.kind === "structured")!;
    expect(planner.name).toBe("kit_refine");
    const prompt = planner.messages.map((m) => m.content).join("\n");
    expect(prompt).toContain(JSON.stringify(prev));
    expect(prompt).toContain(MSG);
    const explainer = llm.calls.find((c) => c.kind === "stream")!;
    const facts = explainer.messages.map((m) => m.content).join("\n");
    expect(facts).toMatch(/what changed/i);
    expect(facts).toContain("Removed: Uniform");
    expect(facts).toContain("Budget changed: 1.500.000₫ → 1.000.000₫");
    const balanced = dataOf(evs, "options").options.find((o) => o.profile === "balanced")!;
    expect(facts).toContain(new Intl.NumberFormat("vi-VN").format(balanced.grandTotal) + "₫");
  });

  it("records a new intent session (+1) but no demand rows; the anti-hunchback gap count is unchanged", async () => {
    const adapter = getAdapter() as InMemoryAdapter;
    const { threadId, sessionId: firstSession } = await heroThread();
    const unmetBackpackSessions = async () =>
      new Set(
        (await adapter.demandItemsSince("2026-08-27"))
          .filter((r) => r.category === "school-backpack" && r.tags.includes("anti-hunchback") && r.matchedCount < 2)
          .map((r) => r.sessionId),
      ).size;
    const rowsBefore = (await adapter.demandItemsSince("2000-01-01")).length;
    const gapBefore = await unmetBackpackSessions();
    const sessionsBefore = adapter.intentSessionCount();

    const { evs } = await runRefine(threadId, refineOutput(heroWithout(["uniform"], { budget: 1_000_000 })));
    const { sessionId } = dataOf(evs, "plan");
    expect(sessionId).not.toBe(firstSession);
    expect((await adapter.demandItemsSince("2000-01-01")).length).toBe(rowsBefore);
    expect(await unmetBackpackSessions()).toBe(gapBefore);
    expect(adapter.intentSessionCount()).toBe(sessionsBefore + 1);
    expect((await adapter.demandItemsSince("2000-01-01")).some((r) => r.sessionId === sessionId)).toBe(false);
  });

  it("refining again builds on version 2 (version 3, diff vs version 2)", async () => {
    const { threadId } = await heroThread();
    await runRefine(threadId, refineOutput(heroWithout(["uniform"], { budget: 1_000_000 })));
    const { evs, llm } = await runRefine(
      threadId,
      refineOutput(heroWithout(["uniform", "lunch-box"], { budget: 1_000_000 })),
      "No lunch box",
    );
    expect(dataOf(evs, "plan")).toMatchObject({ version: 3, diff: { added: [], removed: ["lunch-box"], changed: [] } });
    const prompt = llm.calls[0].messages.map((m) => m.content).join("\n");
    expect(prompt).not.toContain('"key":"uniform"');
  });
});

describe("POST /api/kit/refine: S6 diff", () => {
  it("added item, changed must-have tag, unchanged keys preserved", async () => {
    const { threadId } = await heroThread();
    const out = sloppyHeroPlan();
    out.items[0] = { ...out.items[0], key: "school-bag" }; // same backpack, renamed by the model
    out.items.find((i) => i.key === "shoes")!.mustHaveTags = ["non-slip"];
    out.items.push({ ...out.items[3], key: "raincoat", category: "kids-raincoat", needLabel: "Raincoat" });
    const { evs } = await runRefine(threadId, refineOutput(out), "Add a raincoat, non-slip shoes");
    const { diff, plan } = dataOf(evs, "plan");
    expect(diff).toEqual({ added: ["raincoat"], removed: [], changed: ["shoes"] });
    expect(plan.items.map((i) => i.key)).toEqual([
      "backpack",
      "notebooks",
      "pencils",
      "pencil-case",
      "water-bottle",
      "lunch-box",
      "shoes",
      "uniform",
      "book-covers",
      "raincoat",
    ]);
    const balanced = dataOf(evs, "options").options.find((o) => o.profile === "balanced")!;
    expect([
      ...balanced.lines.map((l) => l.itemKey),
      ...balanced.noMatch.map((n) => n.itemKey),
      ...balanced.skipped.map((s) => s.itemKey),
    ]).toContain("raincoat");
  });

  it("an excluded item never comes back, even under another key (D33); excludedKeys carry over", async () => {
    const { threadId } = await heroThread();
    const v1 = (await getKitStore().getThread(threadId, OWNER))!.versions[0];
    // version 2 = the buyer removed the water bottle with ✕ (what POST /api/kit/adjust remove_item saves)
    await getKitStore().appendVersion(
      {
        ...v1,
        kind: "adjust",
        userText: "Removed: Water bottle",
        plan: { ...v1.plan, items: v1.plan.items.filter((i) => i.key !== "water-bottle") },
        excludedKeys: ["water-bottle"],
        diff: { added: [], removed: ["water-bottle"], changed: [] },
      },
      OWNER,
    );
    const out = sloppyHeroPlan();
    out.items = out.items.map((i) =>
      i.key === "water-bottle" ? { ...i, key: "drink-bottle", needLabel: "Drink bottle" } : i,
    );
    const { evs, llm } = await runRefine(threadId, refineOutput(out), "Add a drink bottle please");
    const prompt = llm.calls[0].messages.map((m) => m.content).join("\n");
    expect(prompt).toMatch(/the buyer already has these, never add them[^\n]*Water bottle/i);
    const { plan, diff, version } = dataOf(evs, "plan");
    expect(version).toBe(3);
    expect(plan.items.map((i) => i.category)).not.toContain("water-bottle");
    expect(diff!.added).toEqual([]);
    for (const o of dataOf(evs, "options").options) {
      expect(o.lines.map((l) => l.product.category)).not.toContain("water-bottle");
    }
    const v3 = (await getKitStore().getThread(threadId, OWNER))!.versions[2];
    expect(v3.excludedKeys).toEqual(["water-bottle"]);
  });

  it("intent 'answer' is still handled as change_kit in this ticket (new version)", async () => {
    const { threadId } = await heroThread();
    const { evs } = await runRefine(
      threadId,
      refineOutput(sloppyHeroPlan(), "answer"),
      "Is the backpack anti-hunchback?",
    );
    expect(dataOf(evs, "done").version).toBe(2);
    expect(dataOf(evs, "plan").diff).toEqual({ added: [], removed: [], changed: [] });
  });

  it("a refine on an awaiting_budget thread that sets the budget produces options, still no demand rows", async () => {
    setLLM(new FakeLLM({ structured: [puppyPlan(null)] }));
    const first = await sseEvents(await newKit(post("/api/kit", { query: "I'm adopting a puppy" })));
    const { threadId } = dataOf(first, "done");
    const rowsBefore = (await getAdapter().demandItemsSince("2000-01-01")).length;
    const { evs } = await runRefine(threadId, refineOutput(puppyPlan(1_000_000)), "Budget 1M");
    expect(eventNames(evs)).toContain("options");
    expect(dataOf(evs, "done").version).toBe(2);
    expect((await getAdapter().demandItemsSince("2000-01-01")).length).toBe(rowsBefore);
  });

  it("a refine that still has no budget asks again (clarify, version awaiting_budget)", async () => {
    setLLM(new FakeLLM({ structured: [puppyPlan(null)] }));
    const first = await sseEvents(await newKit(post("/api/kit", { query: "I'm adopting a puppy" })));
    const { threadId } = dataOf(first, "done");
    const { evs } = await runRefine(threadId, refineOutput({ ...puppyPlan(null), language: "vi" }), "Thêm dây xích");
    expect(eventNames(evs).slice(-2)).toEqual(["clarify", "done"]);
    expect(dataOf(evs, "clarify")).toMatchObject({ threadId, version: 2 });
    const v2 = (await getKitStore().getThread(threadId, OWNER))!.versions[1];
    expect(v2).toMatchObject({ kind: "refine", status: "awaiting_budget", options: [] });
  });

  it("uses the thread's persona, not the cookie's (guest thread stays guest)", async () => {
    const { threadId } = await heroThread(sloppyHeroPlan(), `kitly_uid=${OWNER}; kitly_persona=guest`);
    const { evs } = await runRefine(threadId, refineOutput(sloppyHeroPlan({ budget: 3_000_000 })), "Budget 3M");
    for (const o of dataOf(evs, "options").options) expect(o.savings.some((s) => s.wallet)).toBe(false);
  });
});

describe("POST /api/kit/refine: errors", () => {
  it("unknown threadId → 404 JSON before any stream, no LLM call", async () => {
    const llm = new FakeLLM();
    setLLM(llm);
    const res = await refine(post("/api/kit/refine", { threadId: "no-such-thread", message: MSG }));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).error.code).toBe("not_found");
    expect(llm.calls).toEqual([]);
  });

  it("another browser's thread → 404", async () => {
    const { threadId } = await heroThread();
    setLLM(new FakeLLM());
    const res = await refine(post("/api/kit/refine", { threadId, message: MSG }, "kitly_uid=someone-else"));
    expect(res.status).toBe(404);
    expect((await getKitStore().getThread(threadId, OWNER))!.versions).toHaveLength(1);
  });

  it("400 on a bad body", async () => {
    setLLM(new FakeLLM());
    expect((await refine(post("/api/kit/refine", { threadId: "x", message: "" }))).status).toBe(400);
    expect((await refine(post("/api/kit/refine", { message: "hi" }))).status).toBe(400);
  });

  it("planner fails twice → one error event llm_error, no new version", async () => {
    const { threadId } = await heroThread();
    const { evs } = await runRefine(threadId, new Error("ECONNRESET"));
    expect(evs.at(-1)).toMatchObject({ event: "error", data: { code: "llm_error" } });
    expect((await getKitStore().getThread(threadId, OWNER))!.versions).toHaveLength(1);
  });

  it("exports maxDuration = 120", () => {
    expect(maxDuration).toBe(120);
  });
});
