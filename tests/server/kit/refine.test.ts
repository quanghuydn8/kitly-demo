// Seam S6 — POST /api/kit/refine with the InMemoryAdapter + FakeLLM (plan diff, previous plan honoured, demand
// counts include refinements) and the pure diffPlans/keepPlanKeys helpers.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ApiErrorSchema, KitSseEventSchema, type BasketOption, type KitPlan, type PlanDiff } from "@/contract";
import { kitSample } from "@/contract/fixtures";
import { getAdapter, resetAdapterForTests } from "@/server/adapter";
import { FakeLLM, setLLMForTests } from "@/server/llm";
import { diffPlans, keepPlanKeys } from "@/server/kit/refine";
import { normalizePlan, type PlannerOutput } from "@/server/kit/planner";
import { today } from "@/server/today";
import { POST } from "@/app/api/kit/refine/route";

// A previous plan in real life already went through planKit's normalisation (F1: context tags are never must-haves).
const HERO_PLAN: KitPlan = normalizePlan(
  kitSample.flatMap((e) => (e.event === "plan" ? [e.data.plan] : []))[0] as unknown as PlannerOutput,
);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/kit/refine", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

async function readEvents(res: Response) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((b) => {
      const ev = /^event: (.+)$/m.exec(b)![1];
      const data = JSON.parse(/^data: (.+)$/m.exec(b)![1]);
      return KitSseEventSchema.parse({ event: ev, data });
    });
}

const shape = (evs: { event: string; data: unknown }[]) =>
  evs
    .filter((e) => e.event !== "explanation")
    .map((e) => (e.event === "step" ? `step:${(e.data as { id: string }).id}:${(e.data as { status: string }).status}` : e.event));

async function heroSession(): Promise<string> {
  const { sessionId } = await getAdapter().recordIntent({ query: "Grade 1 kit, 1.5M", plan: HERO_PLAN, source: "live" });
  return sessionId;
}

async function refine(plannerOutput: KitPlan, message: string, extra: Record<string, unknown> = {}) {
  const llm = new FakeLLM({ structured: [plannerOutput], stream: ["Removed ", "the uniform."] });
  setLLMForTests(llm);
  const sessionId = await heroSession();
  const res = await post({ sessionId, previousPlan: HERO_PLAN, message, ...extra });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const evs = await readEvents(res);
  const planEv = evs.find((e) => e.event === "plan")?.data as { sessionId: string; plan: KitPlan; diff?: PlanDiff };
  const options = (evs.find((e) => e.event === "options")?.data as { options: BasketOption[] } | undefined)?.options;
  return { llm, sessionId, evs, planEv, options };
}

beforeEach(() => resetAdapterForTests());
afterEach(() => setLLMForTests(null));

describe("POST /api/kit/refine", () => {
  const noUniform1M = (): KitPlan => ({
    ...clone(HERO_PLAN),
    budget: 1000000,
    items: HERO_PLAN.items.filter((i) => i.key !== "uniform"),
  });

  it("'remove uniform + budget 1M' → diff removed:[uniform], budget updated, total ≤ 1,000,000", async () => {
    const { evs, planEv, options, sessionId } = await refine(noUniform1M(), "School gives the uniform, cut the budget to 1M.");
    expect(shape(evs)).toEqual([
      "step:understand:running",
      "step:understand:done",
      "step:plan:running",
      "step:plan:done",
      "plan",
      "step:search:running",
      "step:search:done",
      "step:optimize:running",
      "step:optimize:done",
      "options",
      "step:explain:running",
      "step:explain:done",
      "done",
    ]);
    expect(planEv.diff).toEqual({ added: [], removed: ["uniform"], changed: [] });
    expect(planEv.plan.budget).toBe(1000000);
    expect(planEv.sessionId).not.toBe(sessionId);
    expect(options).toHaveLength(1);
    expect(options![0].grandTotal).toBeLessThanOrEqual(1000000);
    expect(options![0].status).toBe("ok");
    expect(options![0].lines.map((l) => l.itemKey)).not.toContain("uniform");
    expect((evs.at(-1)!.data as { sessionId: string }).sessionId).toBe(planEv.sessionId);
  });

  it("planner gets the previous plan JSON + the message on the planner model, and is told to keep keys", async () => {
    const msg = "School gives the uniform, cut the budget to 1M.";
    const { llm } = await refine(noUniform1M(), msg);
    const call = llm.calls.find((c) => c.kind === "structured")!;
    expect(call.model).toBe(process.env.KITLY_MODEL_PLANNER || "gpt-6.1-sol");
    const all = call.messages.map((m) => m.content).join("\n");
    expect(all).toContain(JSON.stringify(HERO_PLAN));
    expect(call.messages.at(-1)).toEqual({ role: "user", content: msg });
    expect(all).toMatch(/keep .*key/i);
  });

  it("explainer is told what changed and the new total", async () => {
    const { llm, options } = await refine(noUniform1M(), "School gives the uniform, cut the budget to 1M.");
    const call = llm.calls.find((c) => c.kind === "stream")!;
    const system = call.messages.find((m) => m.role === "system")!.content;
    expect(system).toMatch(/what changed/i);
    const facts = JSON.parse(call.messages.find((m) => m.role === "user")!.content);
    const uniformLabel = HERO_PLAN.items.find((i) => i.key === "uniform")!.needLabel;
    expect(facts.changes).toMatchObject({ removed: [uniformLabel], added: [], changed: [] });
    expect(facts.changes.budget).toEqual({ before: "1.500.000₫", after: "1.000.000₫" });
    expect(facts.grandTotal).toBe(new Intl.NumberFormat("vi-VN").format(options![0].grandTotal) + "₫");
  });

  it("F3: records a new intent session (so refine can continue) but NO demand rows", async () => {
    const msg = "School gives the uniform, cut the budget to 1M.";
    const { planEv } = await refine(noUniform1M(), msg);
    const session = await getAdapter().getIntentSession(planEv.sessionId);
    expect(session).toMatchObject({ query: msg, plan: { budget: 1000000 } });
    const rows = (await getAdapter().demandItemsSince(`${today()}T00:00:00.000Z`)).filter(
      (r) => r.sessionId === planEv.sessionId,
    );
    expect(rows).toHaveLength(0);
    // the demand table only holds the original /api/kit session's rows, none from refine
    const all = await getAdapter().demandItemsSince(`${today()}T00:00:00.000Z`);
    expect(all.some((r) => r.sessionId === planEv.sessionId)).toBe(false);
  });

  it("added item shows in diff.added; unchanged keys are preserved", async () => {
    const next = clone(HERO_PLAN);
    next.items.push({
      key: "raincoat",
      needLabel: "Kids raincoat",
      category: "kids-raincoat",
      required: false,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    });
    const { planEv } = await refine(next, "Add a raincoat too.");
    expect(planEv.diff).toEqual({ added: ["raincoat"], removed: [], changed: [] });
    const keys = planEv.plan.items.map((i) => i.key);
    for (const k of HERO_PLAN.items.map((i) => i.key)) expect(keys).toContain(k);
  });

  it("a changed must-have tag marks only that item changed", async () => {
    const next = clone(HERO_PLAN);
    const bp = next.items.find((i) => i.key === "backpack")!;
    bp.mustHaveTags = [...bp.mustHaveTags, "lightweight"];
    bp.niceToHaveTags = bp.niceToHaveTags.filter((t) => t !== "lightweight");
    const { planEv } = await refine(next, "The backpack must be lightweight.");
    expect(planEv.diff).toEqual({ added: [], removed: [], changed: ["backpack"] });
  });

  it("restores a previous key when the model renames an unchanged item (same category)", async () => {
    const next = clone(HERO_PLAN);
    next.items.find((i) => i.key === "shoes")!.key = "school-shoes";
    const { planEv } = await refine(next, "Nothing else changes.");
    expect(planEv.plan.items.map((i) => i.key)).toEqual(HERO_PLAN.items.map((i) => i.key));
    expect(planEv.diff).toEqual({ added: [], removed: [], changed: [] });
  });

  it("unknown sessionId → 404 contract error, no LLM call", async () => {
    const llm = new FakeLLM({ structured: [HERO_PLAN] });
    setLLMForTests(llm);
    for (const sessionId of ["00000000-0000-4000-8000-00000000dead", "nope"]) {
      const res = await post({ sessionId, previousPlan: HERO_PLAN, message: "cheaper" });
      expect(res.status).toBe(404);
      expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("not_found");
    }
    expect(llm.calls).toHaveLength(0);
  });

  it("bad body → 400", async () => {
    const res = await post({ sessionId: "x", message: "" });
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("bad_request");
  });

  it("planner failure → terminal llm_error event", async () => {
    setLLMForTests(new FakeLLM({ structured: [] }));
    const sessionId = await heroSession();
    const evs = await readEvents(await post({ sessionId, previousPlan: HERO_PLAN, message: "cheaper" }));
    expect(evs.at(-1)).toMatchObject({ event: "error", data: { code: "llm_error" } });
  });
});

describe("diffPlans", () => {
  const base = HERO_PLAN;
  it("identical plans (tag order ignored) → empty diff", () => {
    const next = clone(base);
    next.items[0].niceToHaveTags = [...next.items[0].niceToHaveTags].reverse();
    next.budget = 999;
    expect(diffPlans(base, next)).toEqual({ added: [], removed: [], changed: [] });
  });
  it("quantity, required, maxUnitPrice, category or label change → changed; order follows the plans", () => {
    const next = clone(base);
    next.items.find((i) => i.key === "notebooks")!.quantity = 5;
    next.items.find((i) => i.key === "crayons")!.required = true;
    next.items.find((i) => i.key === "pencils")!.maxUnitPrice = 50000;
    next.items = next.items.filter((i) => i.key !== "lunch-box");
    next.items.unshift({ ...clone(base.items[0]), key: "desk-lamp", category: "kids-desk-lamp" });
    expect(diffPlans(base, next)).toEqual({
      added: ["desk-lamp"],
      removed: ["lunch-box"],
      changed: ["notebooks", "pencils", "crayons"],
    });
  });
});

describe("keepPlanKeys", () => {
  it("re-keys a new item to a vanished previous key with the same category, or same label when category is null", () => {
    const prev = clone(HERO_PLAN);
    prev.items.push({ ...clone(prev.items[0]), key: "pet", needLabel: "Puppy food", category: null });
    const next = clone(prev);
    next.items.find((i) => i.key === "backpack")!.key = "bag";
    next.items.find((i) => i.key === "pet")!.key = "dog-food";
    const kept = keepPlanKeys(prev, next);
    expect(kept.items.map((i) => i.key)).toEqual(prev.items.map((i) => i.key));
  });
  it("leaves genuinely new items and existing keys alone", () => {
    const next = clone(HERO_PLAN);
    next.items.push({ ...clone(next.items[0]), key: "backpack-2", needLabel: "Spare backpack" });
    expect(keepPlanKeys(HERO_PLAN, next).items.map((i) => i.key)).toEqual(next.items.map((i) => i.key));
  });
});
