// Seam S2 — POST /api/kit handler with the InMemoryAdapter + FakeLLM: SSE event order, contract payloads, honest gaps.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  ApiErrorSchema,
  KitSseEventSchema,
  type BasketOption,
  type KitPlan,
} from "@/contract";
import { kitSample } from "@/contract/fixtures";
import { getAdapter, resetAdapterForTests } from "@/server/adapter";
import { FakeLLM, setLLMForTests } from "@/server/llm";
import { POST } from "@/app/api/kit/route";

const HERO_PLAN: KitPlan = kitSample.flatMap((e) => (e.event === "plan" ? [e.data.plan] : []))[0];

const PUPPY_PLAN: KitPlan = {
  event: "other",
  language: "en",
  budget: 2000000,
  deadline: null,
  assumptions: ["Assumed a small puppy"],
  items: [
    {
      key: "puppy-food",
      needLabel: "Puppy food",
      category: null,
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    },
    {
      key: "dog-bed",
      needLabel: "Dog bed",
      category: null,
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: 300000,
    },
    {
      key: "bowl",
      needLabel: "Water bottle for walks",
      category: "water-bottle",
      required: false,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    },
  ],
};

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/kit", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

/** Reads the whole SSE body and parses `event:` / `data:` blocks (single-line data, as the server writes them). */
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
  evs.map((e) => (e.event === "step" ? `step:${(e.data as { id: string; status: string }).id}:${(e.data as { status: string }).status}` : e.event));

let llm: FakeLLM;
beforeEach(() => resetAdapterForTests());
afterEach(() => setLLMForTests(null));

describe("POST /api/kit", () => {
  it("streams the contract event sequence for the hero query, every payload valid", async () => {
    llm = new FakeLLM({ structured: [HERO_PLAN], stream: ["I built ", "a Grade 1 kit."] });
    setLLMForTests(llm);
    const res = await post({ query: "My kid starts Grade 1. Budget 1.5M VND, need everything by Aug 25." });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const evs = await readEvents(res);

    const order = shape(evs).filter((s) => s !== "explanation");
    expect(order).toEqual([
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
    // explanation deltas sit between explain running and explain done
    const s = shape(evs);
    const firstExp = s.indexOf("explanation");
    expect(firstExp).toBeGreaterThan(s.indexOf("step:explain:running"));
    expect(s.lastIndexOf("explanation")).toBeLessThan(s.indexOf("step:explain:done"));
    const text = evs
      .filter((e) => e.event === "explanation")
      .map((e) => (e.data as { delta: string }).delta)
      .join("");
    expect(text).toBe("I built a Grade 1 kit.");

    const detail = (id: string) =>
      (evs.find((e) => e.event === "step" && e.data.id === id && e.data.status === "done")!.data as {
        detail?: string;
      }).detail;
    expect(detail("plan")).toBe("Planned 9 items");
    expect(detail("search")).toMatch(/^Compared \d+ products from \d+ shops$/);
    expect(detail("understand")).toContain("1.500.000₫");
    expect(detail("optimize")).toMatch(/₫/);

    const planEv = evs.find((e) => e.event === "plan")!.data as { sessionId: string; plan: KitPlan };
    const done = evs.at(-1)!.data as { sessionId: string };
    expect(done.sessionId).toBe(planEv.sessionId);
    expect(planEv.plan.budget).toBe(1500000);

    const { options } = evs.find((e) => e.event === "options")!.data as { options: BasketOption[] };
    expect(options).toHaveLength(1);
    const o = options[0];
    expect(o.profile).toBe("balanced");
    expect(o.status).toBe("ok");
    expect(o.grandTotal).toBeLessThanOrEqual(1500000);
    expect(o.lines.some((l) => l.shop.id === "shop-bago")).toBe(false);
    expect(o.noMatch).toEqual([
      { itemKey: "backpack", needLabel: "Anti-hunchback backpack", reason: "none_in_budget" },
    ]);
    expect(o.savings.some((sv) => sv.label.includes("Minh An Stationery"))).toBe(true);
  });

  it("uses the planner model with a structured plan schema, and the fast model for the explanation", async () => {
    llm = new FakeLLM({ structured: [HERO_PLAN] });
    setLLMForTests(llm);
    await readEvents(await post({ query: "Grade 1 kit" }));
    const [planCall, explainCall] = llm.calls;
    expect(planCall.kind).toBe("structured");
    expect(planCall.model).toBe(process.env.KITLY_MODEL_PLANNER || "gpt-6.1-sol");
    const system = planCall.messages.find((m) => m.role === "system")!.content;
    expect(system).toContain("2026-08-20");
    expect(system).toContain("VND");
    expect(system).toMatch(/null/);
    expect(system).toMatch(/Vietnamese/);
    expect(planCall.messages.at(-1)!.content).toContain("Grade 1 kit");
    expect(explainCall.kind).toBe("stream");
    expect(explainCall.model).toBe(process.env.KITLY_MODEL_FAST || "gpt-6-luna");
  });

  it("records the intent session and one demand row per plan item with matchedCount + budgetHint", async () => {
    setLLMForTests(new FakeLLM({ structured: [HERO_PLAN] }));
    const evs = await readEvents(await post({ query: "Grade 1 kit" }));
    const { sessionId } = evs.find((e) => e.event === "plan")!.data as { sessionId: string };
    const rows = (await getAdapter().demandItemsSince("2026-08-20")).filter((r) => r.sessionId === sessionId);
    expect(rows).toHaveLength(HERO_PLAN.items.length);
    const backpack = rows.find((r) => r.needLabel === "Anti-hunchback backpack")!;
    expect(backpack).toMatchObject({
      event: "back_to_school",
      category: "school-backpack",
      tags: ["anti-hunchback"],
      matchedCount: 0,
      budgetHint: 400000, // = maxUnitPrice
    });
    const notebooks = rows.find((r) => r.needLabel === "Grade 1 notebooks")!;
    expect(notebooks.matchedCount).toBeGreaterThan(0);
    expect(notebooks.budgetHint).toBeGreaterThan(0); // budget share
    expect(notebooks.budgetHint!).toBeLessThan(1500000);
  });

  it("uncovered need (category null) → noMatch no_category + demand row with matchedCount 0", async () => {
    setLLMForTests(new FakeLLM({ structured: [PUPPY_PLAN] }));
    const evs = await readEvents(await post({ query: "I'm adopting a puppy" }));
    expect(evs.at(-1)!.event).toBe("done");
    const { options } = evs.find((e) => e.event === "options")!.data as { options: BasketOption[] };
    expect(options[0].noMatch.map((n) => [n.itemKey, n.reason])).toEqual([
      ["puppy-food", "no_category"],
      ["dog-bed", "no_category"],
    ]);
    const { sessionId } = evs.find((e) => e.event === "plan")!.data as { sessionId: string };
    const rows = (await getAdapter().demandItemsSince("2026-08-20")).filter((r) => r.sessionId === sessionId);
    const food = rows.find((r) => r.needLabel === "Puppy food")!;
    expect(food).toMatchObject({ category: null, matchedCount: 0, event: "other" });
    expect(rows.find((r) => r.needLabel === "Dog bed")!.budgetHint).toBe(300000);
  });

  it("profiles parameter returns one option per requested profile, in order", async () => {
    setLLMForTests(new FakeLLM({ structured: [HERO_PLAN] }));
    const evs = await readEvents(await post({ query: "Grade 1 kit", profiles: ["saver", "balanced", "premium"] }));
    const { options } = evs.find((e) => e.event === "options")!.data as { options: BasketOption[] };
    expect(options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
    for (const o of options) expect(o.grandTotal).toBeLessThanOrEqual(1500000);
  });

  it("an LLM failure becomes a terminal error event, never a hung stream", async () => {
    setLLMForTests(new FakeLLM({ structured: [] })); // planner call throws
    const evs = await readEvents(await post({ query: "Grade 1 kit" }));
    expect(shape(evs)).toEqual(["step:understand:running", "error"]);
    expect(evs[1].data).toMatchObject({ code: "llm_error" });
  });

  it("an explainer failure after the options still ends with an error event", async () => {
    const broken = new FakeLLM({ structured: [HERO_PLAN] });
    broken.stream = async function* () {
      yield "Partial ";
      throw new Error("proxy closed");
    };
    setLLMForTests(broken);
    const evs = await readEvents(await post({ query: "Grade 1 kit" }));
    expect(shape(evs)).toContain("options");
    expect(evs.at(-1)!.event).toBe("error");
    expect(evs.at(-1)!.data).toMatchObject({ code: "llm_error" });
  });

  it("rejects an invalid body with a 400 contract error (JSON, not SSE)", async () => {
    setLLMForTests(new FakeLLM());
    const res = await post({ query: "" });
    expect(res.status).toBe(400);
    ApiErrorSchema.parse(await res.json());
  });
});
