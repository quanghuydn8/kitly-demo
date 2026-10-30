// POST /api/kit/adjust (seam S6): code-only kit edits on the In-memory adapter/KitStore. Version 1 comes from the real
// POST /api/kit route (FakeLLM planner); every adjust then runs with a FakeLLM that has NO queued answers.
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as newKit } from "@/app/api/kit/route";
import { POST as refine } from "@/app/api/kit/refine/route";
import { POST as adjust } from "@/app/api/kit/adjust/route";
import { AdjustResponseSchema, type KitChange, type KitVersion } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { getKitStore } from "@/server/kitstore";
import { FakeLLM, setLLM } from "@/server/llm";
import { HERO, heroWithout, refineOutput, sloppyHeroPlan } from "./support/plans";
import { dataOf, sseEvents } from "./support/sse";

const OWNER = "owner-adjust";
const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "₫";
function post(path: string, body: unknown, cookie = `kitly_uid=${OWNER}`) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie },
  });
}

async function heroThread(plan: object = sloppyHeroPlan()) {
  setLLM(new FakeLLM({ structured: [plan], stream: ["Version one."] }));
  const evs = await sseEvents(await newKit(post("/api/kit", { query: HERO })));
  return dataOf(evs, "done");
}

/** Runs one adjust with an LLM that would throw if called; returns the response + parsed version. */
async function runAdjust(threadId: string, change: KitChange | object, cookie?: string) {
  const llm = new FakeLLM();
  setLLM(llm);
  const res = await adjust(post("/api/kit/adjust", { threadId, change }, cookie));
  expect(llm.calls).toEqual([]);
  const body = await res.json();
  return { res, body, version: res.status === 200 ? (AdjustResponseSchema.parse(body).version as KitVersion) : null };
}

const versions = async (threadId: string) => (await getKitStore().getThread(threadId, OWNER))!.versions;

afterEach(() => setLLM(null));

describe("POST /api/kit/adjust", () => {
  it("remove_item → restore_item round-trip; never calls the LLM", async () => {
    const { threadId } = await heroThread();
    const [v1] = await versions(threadId);

    const removed = (await runAdjust(threadId, { type: "remove_item", itemKey: "lunch-box" })).version!;
    expect(removed).toMatchObject({
      version: 2,
      kind: "adjust",
      userText: "Removed: Lunch box",
      excludedKeys: ["lunch-box"],
      status: "ready",
      diff: { added: [], removed: ["lunch-box"], changed: [] },
      selection: null,
      followUp: null,
    });
    expect(removed.plan.items.map((i) => i.key)).not.toContain("lunch-box");
    expect(removed.options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
    for (const o of removed.options) expect(o.lines.map((l) => l.itemKey)).not.toContain("lunch-box");
    const balanced = removed.options.find((o) => o.profile === "balanced")!;
    expect(removed.explanation).toBe(`Removed Lunch box. New total ${vnd(balanced.grandTotal)}.`);

    const restored = (await runAdjust(threadId, { type: "restore_item", itemKey: "lunch-box" })).version!;
    expect(restored).toMatchObject({ version: 3, kind: "adjust", userText: "Restored: Lunch box", excludedKeys: [] });
    expect(restored.diff).toEqual({ added: ["lunch-box"], removed: [], changed: [] });
    expect(restored.plan).toEqual(v1.plan);
    expect(restored.options).toEqual(v1.options);
    expect((await versions(threadId)).map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it("restore_version 1 after a refine gives a version whose plan equals version 1 (kind restore)", async () => {
    const { threadId } = await heroThread();
    await runAdjust(threadId, { type: "remove_item", itemKey: "lunch-box" });
    setLLM(
      new FakeLLM({
        structured: [refineOutput(heroWithout(["uniform", "lunch-box"], { budget: 1_000_000 }))],
        stream: ["ok"],
      }),
    );
    await sseEvents(await refine(post("/api/kit/refine", { threadId, message: "Remove the uniform, budget 1M" })));
    const [v1, , v3] = await versions(threadId);
    expect(v3.kind).toBe("refine");
    expect(v3.excludedKeys).toEqual(["lunch-box"]);

    const v4 = (await runAdjust(threadId, { type: "restore_version", version: 1 })).version!;
    expect(v4).toMatchObject({ version: 4, kind: "restore", userText: "Restored version 1", status: "ready" });
    expect(v4.plan).toEqual(v1.plan);
    expect(v4.excludedKeys).toEqual(v1.excludedKeys);
    expect(v4.options).toEqual(v1.options);
    expect(v4.diff!.added.sort()).toEqual(["lunch-box", "uniform"]);
    expect(v4.explanation).toMatch(/^Restored version 1\. New total [\d.]+₫\.$/);
  });

  it("set_budget re-optimizes under the new budget; set_deadline changes the deadline", async () => {
    const { threadId } = await heroThread();
    const v2 = (await runAdjust(threadId, { type: "set_budget", budget: 1_000_000 })).version!;
    expect(v2.plan.budget).toBe(1_000_000);
    expect(v2.userText).toBe("Budget: 1.000.000₫");
    expect(v2.diff).toEqual({ added: [], removed: [], changed: [] });
    for (const o of v2.options) expect(o.grandTotal).toBeLessThanOrEqual(1_000_000);
    expect(v2.explanation).toMatch(/^Budget set to 1\.000\.000₫\. New total [\d.]+₫\.$/);

    const v3 = (await runAdjust(threadId, { type: "set_deadline", deadline: "2026-09-04" })).version!;
    expect(v3.plan.deadline).toBe("2026-09-04");
    expect(v3.userText).toBe("Deadline: Sep 4");
    for (const o of v3.options) for (const l of o.lines) expect(l.product.shipDaysMax).toBeLessThanOrEqual(2);
  });

  it("over budget after an adjust: the explanation says by how much", async () => {
    const { threadId } = await heroThread();
    const v2 = (await runAdjust(threadId, { type: "set_budget", budget: 300_000 })).version!;
    const b = v2.options.find((o) => o.profile === "balanced")!;
    expect(b.status).toBe("over_budget");
    expect(v2.explanation).toBe(
      `Budget set to 300.000₫. New total ${vnd(b.grandTotal)}, over budget by ${vnd(b.overBy!)}.`,
    );
  });

  it("explanation and label in the plan language (vi)", async () => {
    const { threadId } = await heroThread({ ...sloppyHeroPlan(), language: "vi" });
    const v2 = (await runAdjust(threadId, { type: "remove_item", itemKey: "lunch-box" })).version!;
    const b = v2.options.find((o) => o.profile === "balanced")!;
    expect(v2.userText).toBe("Đã bỏ: Lunch box");
    expect(v2.explanation).toBe(`Đã bỏ Lunch box. Tổng mới ${vnd(b.grandTotal)}.`);
  });

  it("set_budget on an awaiting_budget thread produces the first options and records demand items exactly once", async () => {
    const adapter = getAdapter();
    const { threadId } = await heroThread(sloppyHeroPlan({ budget: null }));
    expect((await versions(threadId))[0].status).toBe("awaiting_budget");
    const rows0 = (await adapter.demandItemsSince("2000-01-01")).length;

    const v2 = (await runAdjust(threadId, { type: "set_budget", budget: 1_000_000 })).version!;
    expect(v2).toMatchObject({ version: 2, kind: "adjust", status: "ready" });
    expect(v2.options).toHaveLength(3);
    const rows1 = await adapter.demandItemsSince("2000-01-01");
    expect(rows1.length).toBe(rows0 + v2.plan.items.length);
    const added = rows1.slice(rows0);
    expect(new Set(added.map((r) => r.sessionId)).size).toBe(1);
    expect(added.map((r) => r.needLabel).sort()).toEqual(v2.plan.items.map((i) => i.needLabel).sort());

    await runAdjust(threadId, { type: "set_budget", budget: 2_000_000 });
    expect((await adapter.demandItemsSince("2000-01-01")).length).toBe(rows1.length);
  });

  it("an awaiting_budget thread stays awaiting for other changes; set_budget null = no limit (ready)", async () => {
    const { threadId } = await heroThread(sloppyHeroPlan({ budget: null }));
    const v2 = (await runAdjust(threadId, { type: "remove_item", itemKey: "lunch-box" })).version!;
    expect(v2).toMatchObject({ status: "awaiting_budget", options: [], explanation: "" });
    const v3 = (await runAdjust(threadId, { type: "set_budget", budget: null })).version!;
    expect(v3.status).toBe("ready");
    expect(v3.userText).toBe("No budget limit");
    for (const o of v3.options) expect(o.status).toBe("ok");
  });

  it("a set_budget on a ready thread records no demand", async () => {
    const adapter = getAdapter();
    const { threadId } = await heroThread();
    const rows0 = (await adapter.demandItemsSince("2000-01-01")).length;
    await runAdjust(threadId, { type: "set_budget", budget: 2_000_000 });
    expect((await adapter.demandItemsSince("2000-01-01")).length).toBe(rows0);
  });

  it("errors: other owner / unknown thread 404; bad body, unknown item, not excluded, unknown version, bad date 400", async () => {
    const { threadId } = await heroThread();
    expect(
      (await runAdjust(threadId, { type: "remove_item", itemKey: "shoes" }, "kitly_uid=someone-else")).res.status,
    ).toBe(404);
    expect((await runAdjust("nope", { type: "remove_item", itemKey: "shoes" })).res.status).toBe(404);
    for (const change of [
      { type: "explode" },
      { type: "remove_item", itemKey: "unicorn" },
      { type: "restore_item", itemKey: "shoes" },
      { type: "restore_version", version: 9 },
      { type: "set_deadline", deadline: "next week" },
      { type: "set_deadline", deadline: "2026-08-01" },
      { type: "set_budget", budget: -5 },
    ]) {
      const { res, body } = await runAdjust(threadId, change);
      expect(res.status, JSON.stringify(change)).toBe(400);
      expect(body.error.code).toBeTruthy();
    }
    expect(await versions(threadId)).toHaveLength(1);
  });

  it("answers in < 100 ms on the in-memory store", async () => {
    const { threadId } = await heroThread();
    await runAdjust(threadId, { type: "set_budget", budget: 1_200_000 }); // warm-up
    const t0 = performance.now();
    await runAdjust(threadId, { type: "remove_item", itemKey: "lunch-box" });
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
