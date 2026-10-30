// POST /api/kit (seam S2): the real route handler on the In-memory adapter/KitStore + FakeLLM.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { KitStreamEventSchema, type KitStreamEvent } from "@/contract";
import { POST, maxDuration } from "@/app/api/kit/route";
import { getAdapter } from "@/server/adapter";
import { getKitStore } from "@/server/kitstore";
import { FakeLLM, setLLM } from "@/server/llm";
import { HERO, puppyPlan, sloppyHeroPlan } from "./support/plans";

const OWNER = "owner-a";
function request(body: unknown, cookie = `kitly_uid=${OWNER}`) {
  return new NextRequest("http://localhost/api/kit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie },
  });
}

/** Reads the whole SSE body and validates every event against the contract. */
async function events(res: Response): Promise<KitStreamEvent[]> {
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event: "))!.slice(7);
      const data = JSON.parse(
        lines
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("\n"),
      );
      return KitStreamEventSchema.parse({ event, data });
    });
}
const names = (evs: KitStreamEvent[]) =>
  evs.map((e) => (e.event === "step" ? `${e.data.id}:${e.data.status}` : e.event));
const dataOf = <N extends KitStreamEvent["event"]>(evs: KitStreamEvent[], n: N) =>
  evs.find((e) => e.event === n)?.data as Extract<KitStreamEvent, { event: N }>["data"];
const EXPLANATION = ["Your kit costs ", "under budget. ", "Closest: Minh An Kids Backpack, missing anti-hunchback."];

async function runHero(over: { profiles?: string[]; cookie?: string; llm?: FakeLLM } = {}) {
  const llm = over.llm ?? new FakeLLM({ structured: [sloppyHeroPlan()], stream: EXPLANATION });
  setLLM(llm);
  const res = await POST(request({ query: HERO, ...(over.profiles ? { profiles: over.profiles } : {}) }, over.cookie));
  return { llm, res, evs: await events(res) };
}

afterEach(() => setLLM(null));

describe("POST /api/kit: hero sentence", () => {
  it("streams the contract events in order, all valid", async () => {
    const { evs } = await runHero();
    const seq = names(evs).filter((n) => n !== "explanation");
    expect(seq).toEqual([
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
      "followup",
      "done",
    ]);
    expect(names(evs).filter((n) => n === "explanation").length).toBe(3);
    expect(names(evs).indexOf("options")).toBeLessThan(names(evs).indexOf("explanation"));
    expect(names(evs)).not.toContain("clarify");
    const steps = evs.flatMap((e) => (e.event === "step" && e.data.status === "done" ? [e.data] : []));
    expect(steps.find((s) => s.id === "plan")!.detail).toBe("Planned 9 items");
    expect(steps.find((s) => s.id === "search")!.detail).toMatch(/^Compared \d+ products from \d+ shops$/);
    const plan = dataOf(evs, "plan");
    const done = dataOf(evs, "done");
    expect(plan.version).toBe(1);
    expect(done).toEqual({ sessionId: plan.sessionId, threadId: plan.threadId, version: 1 });
  });

  it("sends one option per profile (all three by default), backpack = noMatch with Minh An closest, never in lines", async () => {
    const { evs } = await runHero();
    const { options } = dataOf(evs, "options");
    expect(options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
    for (const o of options) {
      const nm = o.noMatch.find((n) => n.itemKey === "backpack")!;
      expect(nm.closest!.candidate.product.id).toBe("prod-minhan-backpack");
      expect(nm.closest!.missingTags).toEqual(["anti-hunchback"]);
      expect(o.lines.map((l) => l.product.id)).not.toContain("prod-minhan-backpack");
      expect(o.lines.map((l) => l.itemKey)).not.toContain("backpack");
      expect(o.status).toBe("ok");
      expect(o.grandTotal).toBeLessThanOrEqual(1_500_000);
    }
    // Bago Bags ships in 6–9 days: never in a basket for Sep 5
    expect(options.flatMap((o) => o.lines.map((l) => l.shop.id))).not.toContain("shop-bago");
  });

  it("honours the profiles parameter: one option per requested profile", async () => {
    const { evs } = await runHero({ profiles: ["saver"] });
    expect(dataOf(evs, "options").options.map((o) => o.profile)).toEqual(["saver"]);
    const two = await runHero({ profiles: ["premium", "balanced"] });
    expect(dataOf(two.evs, "options").options.map((o) => o.profile)).toEqual(["premium", "balanced"]);
  });

  it("saves version 1 before done (options + full explanation); another owner gets null", async () => {
    const { evs } = await runHero();
    const { threadId } = dataOf(evs, "done");
    const t = await getKitStore().getThread(threadId, OWNER);
    expect(t!.thread).toMatchObject({ title: HERO.slice(0, 60).trimEnd(), persona: "lan", versionCount: 1 });
    expect(t!.thread.title.length).toBeLessThanOrEqual(60);
    const v = t!.versions[0];
    expect(v).toMatchObject({ version: 1, kind: "new", userText: HERO, status: "ready", excludedKeys: [] });
    expect(v.explanation).toBe(EXPLANATION.join(""));
    expect(v.options).toEqual(dataOf(evs, "options").options);
    expect(v.plan).toEqual(dataOf(evs, "plan").plan);
    expect(v.diff).toBeNull();
    expect(v.selection).toBeNull();
    expect(v.followUp).toEqual(dataOf(evs, "followup").followUp); // ticket 16: saved with the version
    expect(await getKitStore().getThread(threadId, "owner-b")).toBeNull();
  });

  it("copies the persona cookie onto the thread; guest gets no wallet saving", async () => {
    const { evs } = await runHero({ cookie: `kitly_uid=${OWNER}; kitly_persona=guest` });
    const t = await getKitStore().getThread(dataOf(evs, "done").threadId, OWNER);
    expect(t!.thread.persona).toBe("guest");
    for (const o of dataOf(evs, "options").options) expect(o.savings.some((s) => s.wallet)).toBe(false);
    const lan = await runHero();
    expect(dataOf(lan.evs, "options").options.some((o) => o.savings.some((s) => s.wallet))).toBe(true);
  });

  it("records the intent session + exactly one demand row per plan item (matchedCount, budgetHint)", async () => {
    const { evs } = await runHero();
    const { sessionId, plan } = dataOf(evs, "plan");
    const rows = (await getAdapter().demandItemsSince("2000-01-01")).filter((r) => r.sessionId === sessionId);
    expect(rows).toHaveLength(plan.items.length);
    const backpack = rows.find((r) => r.category === "school-backpack")!;
    expect(backpack).toMatchObject({ tags: ["anti-hunchback"], matchedCount: 0, budgetHint: 400_000 });
    const notebooks = rows.find((r) => r.category === "notebooks")!;
    expect(notebooks.matchedCount).toBe(2);
    expect(notebooks.budgetHint).toBeGreaterThan(0); // budget share
    expect(notebooks.budgetHint).toBeLessThan(1_500_000);
  });

  it("logs each step's duration server-side", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await runHero();
    const line = spy.mock.calls.map((c) => String(c[0])).find((s) => s.startsWith("[kit]"));
    spy.mockRestore();
    expect(line).toMatch(/^\[kit\] understand \d+\.\d+s search \d+\.\d+s optimize \d+\.\d+s explain \d+\.\d+s/);
  });
});

describe("POST /api/kit: clarify (D32)", () => {
  it("no budget → plan, clarify, done; version 1 awaiting_budget; no matcher/optimizer/explainer/demand", async () => {
    const llm = new FakeLLM({ structured: [puppyPlan(null)], stream: ["never"] });
    setLLM(llm);
    const evs = await events(await POST(request({ query: "I'm adopting a puppy" })));
    expect(names(evs)).toEqual([
      "understand:running",
      "understand:done",
      "plan:running",
      "plan",
      "plan:done",
      "clarify",
      "done",
    ]);
    const clarify = dataOf(evs, "clarify");
    expect(clarify.question).toEqual({
      kind: "budget",
      text: "What's your budget?",
      choices: [500000, 1000000, 2000000, null],
    });
    expect(llm.calls.map((c) => c.kind)).toEqual(["structured"]);
    const { sessionId, threadId } = dataOf(evs, "plan");
    expect(clarify).toMatchObject({ threadId, version: 1 });
    const v = (await getKitStore().getThread(threadId, OWNER))!.versions[0];
    expect(v).toMatchObject({ status: "awaiting_budget", options: [], explanation: "", followUp: null });
    const rows = (await getAdapter().demandItemsSince("2000-01-01")).filter((r) => r.sessionId === sessionId);
    expect(rows).toEqual([]);
  });

  it("asks in Vietnamese for a vi plan", async () => {
    setLLM(new FakeLLM({ structured: [{ ...puppyPlan(null), language: "vi" }] }));
    const evs = await events(await POST(request({ query: "Tôi sắp nuôi chó con" })));
    expect(dataOf(evs, "clarify").question.text).toMatch(/ngân sách/i);
  });
});

describe("POST /api/kit: honest gaps", () => {
  it("uncovered items → noMatch no_category + demand rows with matchedCount 0", async () => {
    setLLM(new FakeLLM({ structured: [puppyPlan(1_000_000)], stream: ["Nothing in store yet."] }));
    const evs = await events(await POST(request({ query: "I'm adopting a puppy, budget 1M" })));
    const { options } = dataOf(evs, "options");
    expect(options[1].noMatch.map((n) => [n.itemKey, n.reason])).toEqual([
      ["dog-food", "no_category"],
      ["dog-bed", "no_category"],
    ]);
    expect(options[1].lines).toEqual([]);
    const { sessionId } = dataOf(evs, "plan");
    const rows = (await getAdapter().demandItemsSince("2000-01-01")).filter((r) => r.sessionId === sessionId);
    expect(rows.map((r) => [r.needLabel, r.category, r.matchedCount])).toEqual([
      ["Dog food", null, 0],
      ["Dog bed", null, 0],
    ]);
    expect(names(evs).at(-1)).toBe("done");
  });
});

describe("POST /api/kit: failures", () => {
  it("planner fails once (invalid JSON) → retried, stream completes", async () => {
    const llm = new FakeLLM({ structured: ["{oops", sloppyHeroPlan()], stream: EXPLANATION });
    const { evs } = await runHero({ llm });
    // 2 planner calls (+ the ticket 16 follow-up call, which falls back to its template here)
    expect(llm.calls.filter((c) => c.kind === "structured" && c.name !== "kit_followup")).toHaveLength(2);
    expect(names(evs).at(-1)).toBe("done");
    expect(names(evs)).not.toContain("error");
  });

  it("planner fails twice → one error event llm_error, the stream closes", async () => {
    const llm = new FakeLLM({ structured: ["{oops", new Error("ECONNRESET")] });
    const { evs } = await runHero({ llm });
    expect(evs.filter((e) => e.event === "error")).toHaveLength(1);
    expect(evs.at(-1)).toMatchObject({ event: "error", data: { code: "llm_error" } });
    expect(names(evs)).not.toContain("done");
  });

  it("explainer stream fails mid-way → no error event, explain done 'Explanation unavailable', then done", async () => {
    const llm = new FakeLLM({ structured: [sloppyHeroPlan()], stream: [["Partial ", new Error("proxy stall")]] });
    const { evs } = await runHero({ llm });
    expect(names(evs)).not.toContain("error");
    const explainDone = evs.find((e) => e.event === "step" && e.data.id === "explain" && e.data.status === "done");
    expect(explainDone!.data).toEqual({ id: "explain", status: "done", detail: "Explanation unavailable" });
    expect(evs.at(-1)!.event).toBe("done");
    const t = await getKitStore().getThread(dataOf(evs, "done").threadId, OWNER);
    expect(t!.versions[0].status).toBe("ready");
  });

  it("400 JSON on a bad body, no stream", async () => {
    setLLM(new FakeLLM());
    const res = await POST(request({ query: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });

  it("exports maxDuration = 120", () => {
    expect(maxDuration).toBe(120);
  });
});
