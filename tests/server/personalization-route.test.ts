// Ticket 16, seam S10: "the marketplace knows me" through the real route handlers (POST /api/kit, /api/kit/refine,
// /api/kit/price, /api/kit/adjust, GET /api/threads/:id) on the In-memory adapter/KitStore + FakeLLM, hero fixture,
// DEMO_TODAY=2026-09-02.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BasketOption, KitStreamEvent } from "@/contract";
import { POST as newKit } from "@/app/api/kit/route";
import { POST as refine } from "@/app/api/kit/refine/route";
import { POST as price } from "@/app/api/kit/price/route";
import { POST as adjust } from "@/app/api/kit/adjust/route";
import { GET as getThread } from "@/app/api/threads/[id]/route";
import { getAdapter } from "@/server/adapter";
import { getKitStore } from "@/server/kitstore";
import { formatVnd } from "@/server/optimizer";
import { FakeLLM, fakeDelay, setLLM } from "@/server/llm";
import { HERO, refineOutput, sloppyHeroPlan } from "./support/plans";
import { dataOf, eventNames, sseEvents } from "./support/sse";

const OWNER = "owner-personal";
const cookieFor = (persona?: "lan" | "guest") => `kitly_uid=${OWNER}${persona ? `; kitly_persona=${persona}` : ""}`;
function post(path: string, body: unknown, cookie = cookieFor()) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie },
  });
}
const llmFollowUp = (question: string, suggestions: { text: string; interestItemKey?: string | null }[]) => ({
  question,
  suggestions: suggestions.map((s) => ({ text: s.text, interestItemKey: s.interestItemKey ?? null, swapProductId: null })),
});
const GOOD_FOLLOWUP = llmFollowUp("The KidZone Lite from your cart is 440.000₫ with LAN-KZ80. Switch to it?", [
  { text: "Switch to KidZone Lite", interestItemKey: "backpack" },
  { text: "Keep my kit" },
]);

async function heroKit(opts: { persona?: "lan" | "guest"; followUp?: unknown; stream?: unknown[] } = {}) {
  const structured: unknown[] = [sloppyHeroPlan()];
  if (opts.followUp !== undefined) structured.push(opts.followUp);
  const llm = new FakeLLM({ structured, stream: (opts.stream ?? ["Your kit ", "fits the budget."]) as string[] });
  setLLM(llm);
  const evs = await sseEvents(await newKit(post("/api/kit", { query: HERO }, cookieFor(opts.persona))));
  const balanced = dataOf(evs, "options").options.find((o) => o.profile === "balanced")!;
  return { llm, evs, balanced, threadId: dataOf(evs, "done").threadId };
}
const withoutExplanation = (evs: KitStreamEvent[]) => eventNames(evs).filter((n) => n !== "explanation");

afterEach(() => {
  setLLM(null);
  vi.restoreAllMocks();
});

describe("S10: wallet vouchers (D46)", () => {
  it("Lan: Balanced has a wallet saving from LAN-BTS10; Guest on the same plan has none and a higher grandTotal", async () => {
    const lan = await heroKit({ persona: "lan" });
    const guest = await heroKit({ persona: "guest" });
    const wallet = lan.balanced.savings.filter((s) => s.wallet);
    expect(wallet.map((s) => s.label)).toContain("Your wallet voucher Back-to-school 10%");
    expect(guest.balanced.savings.some((s) => s.wallet)).toBe(false);
    expect(guest.balanced.grandTotal).toBeGreaterThan(lan.balanced.grandTotal);
  });

  it("no persona cookie ⇒ Lan; the thread keeps the persona it was created with", async () => {
    const { threadId } = await heroKit();
    const t = await getKitStore().getThread(threadId, OWNER);
    expect(t!.thread.persona).toBe("lan");
  });
});

describe("S10: 💛 cart interests (D40)", () => {
  it("Lan: every option has the KidZone Lite interest for the backpack (440k, over by 40k, missing anti-hunchback), never in lines", async () => {
    const { evs } = await heroKit({ persona: "lan" });
    for (const o of dataOf(evs, "options").options) {
      const i = o.interests!.find((x) => x.itemKey === "backpack")!;
      expect(i.candidate.product.id).toBe("prod-kidzone-lite-backpack");
      expect(i).toMatchObject({ walletVoucherCode: "LAN-KZ80", priceAfterVoucher: 440_000, overMaxPriceBy: 40_000, missingTags: ["anti-hunchback"] });
      expect(o.lines.map((l) => l.product.id)).not.toContain("prod-kidzone-lite-backpack");
    }
  });

  it("Guest: no interests", async () => {
    const { evs } = await heroKit({ persona: "guest" });
    for (const o of dataOf(evs, "options").options) expect(o.interests ?? []).toEqual([]);
  });

  it("/api/kit/price accepts the interest product as a pick ⇒ 200, KidZone wallet voucher applied", async () => {
    const { threadId } = await heroKit({ persona: "lan" });
    const res = await price(
      post("/api/kit/price", { threadId, selection: { profile: "balanced", picks: { backpack: "prod-kidzone-lite-backpack" }, dropped: [] } }),
    );
    expect(res.status).toBe(200);
    const { option } = (await res.json()) as { option: BasketOption };
    const line = option.lines.find((l) => l.itemKey === "backpack")!;
    expect(line.product.id).toBe("prod-kidzone-lite-backpack");
    expect(option.shops.find((s) => s.shopId === "shop-kidzone")!.voucherCodes).toContain("LAN-KZ80");
    expect(option.savings).toContainEqual({ label: "Your wallet voucher KidZone 80k off", amount: 80_000, wallet: true });
    expect(option.noMatch.map((n) => n.itemKey)).not.toContain("backpack");
    expect(option.interests ?? []).toEqual([]); // the cart product is now the line's product
  });

  it("/api/kit/price still rejects a product that is neither candidate, closest nor interest (400)", async () => {
    const { threadId } = await heroKit({ persona: "guest" });
    const res = await price(
      post("/api/kit/price", { threadId, selection: { profile: "balanced", picks: { backpack: "prod-kidzone-lite-backpack" }, dropped: [] } }),
    );
    expect(res.status).toBe(400);
  });

  it("adjust versions keep interests on their options and have followUp null", async () => {
    const { threadId } = await heroKit({ persona: "lan" });
    setLLM(new FakeLLM());
    const res = await adjust(post("/api/kit/adjust", { threadId, change: { type: "remove_item", itemKey: "uniform" } }));
    expect(res.status).toBe(200);
    const { version } = await res.json();
    expect(version.followUp).toBeNull();
    for (const o of version.options as BasketOption[]) expect(o.interests!.map((i) => i.candidate.product.id)).toEqual(["prod-kidzone-lite-backpack"]);
  });
});

describe("S10: follow-up (D41)", () => {
  it("followup event after the explanation, before done; saved on the version; guard keeps a cited 440.000₫ + swap action", async () => {
    const { evs, threadId } = await heroKit({ persona: "lan", followUp: GOOD_FOLLOWUP });
    expect(withoutExplanation(evs).slice(-3)).toEqual(["explain:done", "followup", "done"]);
    const names = eventNames(evs);
    expect(names.lastIndexOf("explanation")).toBeLessThan(names.indexOf("followup"));
    const { followUp } = dataOf(evs, "followup");
    expect(followUp.source).toBe("llm");
    expect(followUp.suggestions[0].action).toEqual({ type: "swap", itemKey: "backpack", productId: "prod-kidzone-lite-backpack" });
    const v = (await getKitStore().getThread(threadId, OWNER))!.versions[0];
    expect(v.followUp).toEqual(followUp);
  });

  it("guard: a follow-up citing 399.000₫ (not in context) ⇒ template, source template", async () => {
    const { evs } = await heroKit({
      persona: "lan",
      followUp: llmFollowUp("KidZone Lite is 399.000₫ today, switch?", [{ text: "Switch" }, { text: "Keep" }]),
    });
    const { followUp } = dataOf(evs, "followup");
    expect(followUp.source).toBe("template");
    expect(followUp.question).toMatch(/3 days/);
  });

  it("FakeLLM follow-up throws ⇒ the stream still ends followup (template) → done; event order otherwise unchanged", async () => {
    const { evs } = await heroKit({ persona: "lan", followUp: new Error("follow-up down") });
    expect(withoutExplanation(evs)).toEqual([
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
    expect(dataOf(evs, "followup").followUp.source).toBe("template");
  });

  it("explainer failure still sends the follow-up", async () => {
    const { evs } = await heroKit({ persona: "lan", followUp: GOOD_FOLLOWUP, stream: [new Error("stall")] });
    expect(withoutExplanation(evs).slice(-3)).toEqual(["explain:done", "followup", "done"]);
    expect(dataOf(evs, "followup").followUp.source).toBe("llm");
  });

  it("the follow-up gets the buyer's sentence and the sales context; the explainer gets the sales context too", async () => {
    const { llm } = await heroKit({ persona: "lan", followUp: GOOD_FOLLOWUP });
    const fu = llm.calls.find((c) => c.kind === "structured" && c.name === "kit_followup")!;
    const prompt = fu.messages.map((m) => m.content).join("\n");
    expect(prompt).toContain(HERO);
    expect(prompt).toContain('"hooks":["deadline_soon","cart_interest","voucher_expiring"');
    const explain = llm.calls.find((c) => c.kind === "stream")!;
    expect(explain.messages.map((m) => m.content).join("\n")).toContain("LAN-KZ80");
  });

  it("Full: follow-up and explainer run concurrently (total ≈ max, not sum)", async () => {
    const D = 250;
    const t0 = performance.now();
    const { evs } = await heroKit({
      persona: "lan",
      followUp: fakeDelay(D, GOOD_FOLLOWUP),
      stream: [fakeDelay(D), "Explained."] as unknown[],
    });
    const elapsed = performance.now() - t0;
    expect(dataOf(evs, "followup").followUp.source).toBe("llm");
    expect(elapsed).toBeGreaterThanOrEqual(D - 5);
    expect(elapsed).toBeLessThan(2 * D - 50);
  });

  it("Full: the timing log includes `followup <s> (llm|template)`", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await heroKit({ persona: "lan", followUp: GOOD_FOLLOWUP });
    await heroKit({ persona: "lan", followUp: new Error("x") });
    const lines = info.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[kit]"));
    expect(lines.some((l) => /followup \d+\.\d+s \(llm\)/.test(l))).toBe(true);
    expect(lines.some((l) => /followup \d+\.\d+s \(template\)/.test(l))).toBe(true);
  });
});

describe("S10: answer turns (D42)", () => {
  const QUESTION = "Is the Minh An backpack really anti-hunchback?";
  const ANSWER = ["Not tagged anti-hunchback, ", "but it has an ergonomic back panel."];

  async function answerTurn(persona: "lan" | "guest" = "lan") {
    const { threadId } = await heroKit({ persona, followUp: GOOD_FOLLOWUP });
    const adapter = getAdapter();
    const rowsBefore = (await adapter.demandItemsSince("2000-01-01")).length;
    const intent = vi.spyOn(adapter, "recordIntent");
    const demand = vi.spyOn(adapter, "recordDemandItems");
    const llm = new FakeLLM({
      structured: [refineOutput(sloppyHeroPlan({ budget: 1_000_000 }), "answer"), GOOD_FOLLOWUP],
      stream: ANSWER,
    });
    setLLM(llm);
    const evs = await sseEvents(await refine(post("/api/kit/refine", { threadId, message: QUESTION })));
    return { threadId, evs, llm, intent, demand, rowsBefore };
  }

  it("events step…, explanation…, followup, done{answered:true}; no new version, 1 message; no intent, no demand", async () => {
    const { threadId, evs, intent, demand, rowsBefore } = await answerTurn();
    const names = eventNames(evs);
    expect(names.filter((n) => n !== "explanation")).toEqual(["understand:running", "understand:done", "followup", "done"]);
    expect(names.filter((n) => n === "explanation")).toHaveLength(2);
    const understood = evs.find((e) => e.event === "step" && e.data.status === "done")!;
    expect(understood.data).toMatchObject({ id: "understand", detail: "Answering" });
    expect(dataOf(evs, "done")).toEqual({ sessionId: null, threadId, version: 1, answered: true });
    expect(intent).not.toHaveBeenCalled();
    expect(demand).not.toHaveBeenCalled();
    expect((await getAdapter().demandItemsSince("2000-01-01")).length).toBe(rowsBefore);

    const t = (await getKitStore().getThread(threadId, OWNER))!;
    expect(t.versions).toHaveLength(1);
    expect(t.versions[0].plan.budget).toBe(1_500_000); // the planner's plan is ignored on an answer
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ threadId, afterVersion: 1, userText: QUESTION, answer: ANSWER.join("") });
    expect(t.messages[0].followUp).toEqual(dataOf(evs, "followup").followUp);
  });

  it("the answer is a fast-model stream (≤ 80 words, plan language) with the named product's facts + sales context", async () => {
    vi.stubEnv("KITLY_MODEL_FAST", "fast-answer");
    try {
      const { llm } = await answerTurn();
      const stream = llm.calls.filter((c) => c.kind === "stream");
      expect(stream).toHaveLength(1);
      expect(stream[0].model).toBe("fast-answer");
      const prompt = stream[0].messages.map((m) => m.content).join("\n");
      expect(prompt).toMatch(/80 words/);
      expect(prompt).toMatch(/English/);
      expect(prompt).toContain(QUESTION);
      expect(prompt).toContain("Padded ergonomic back panel"); // Minh An's description
      expect(prompt).toMatch(/rating 4\.8/);
      expect(prompt).toMatch(/ships in 1–2 days/);
      expect(prompt).toContain('"daysLeft":3');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a question about an item sees that line's alternatives (31/10: 'a fancier lunch box?' → 'none in the catalog' while the panel showed one)", async () => {
    const { threadId } = await heroKit({ persona: "lan", followUp: GOOD_FOLLOWUP });
    const v1 = (await getKitStore().getThread(threadId, OWNER))!.versions[0];
    const line = v1.options.find((o) => o.profile === "balanced")!.lines.find((l) => l.itemKey === "lunch-box")!;
    expect(line.alternatives.length).toBeGreaterThan(0);
    const llm = new FakeLLM({ structured: [refineOutput(sloppyHeroPlan(), "answer"), GOOD_FOLLOWUP], stream: ANSWER });
    setLLM(llm);
    await sseEvents(await refine(post("/api/kit/refine", { threadId, message: "Is there a fancier lunch box?" })));
    const prompt = llm.calls.find((c) => c.kind === "stream")!.messages.map((m) => m.content).join("\n");
    for (const a of line.alternatives) {
      expect(prompt).toContain(a.product.title);
      expect(prompt).toContain(formatVnd(a.product.price));
      expect(prompt).toContain(`swapping makes the kit about ${formatVnd(v1.options.find((o) => o.profile === "balanced")!.grandTotal + (a.product.price - line.product.price) * line.quantity)}`);
    }
  });

  it("GET /api/threads/:id returns the messages", async () => {
    const { threadId } = await answerTurn();
    const res = await getThread(new NextRequest(`http://localhost/api/threads/${threadId}`, { headers: { cookie: cookieFor() } }), {
      params: Promise.resolve({ id: threadId }),
    });
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.versions).toHaveLength(1);
  });

  it("an answer turn follow-up falls back to the template when the LLM fails", async () => {
    const { threadId } = await heroKit({ persona: "lan", followUp: GOOD_FOLLOWUP });
    setLLM(new FakeLLM({ structured: [refineOutput(sloppyHeroPlan(), "answer"), new Error("x")], stream: ANSWER }));
    const evs = await sseEvents(await refine(post("/api/kit/refine", { threadId, message: QUESTION })));
    expect(eventNames(evs).slice(-2)).toEqual(["followup", "done"]);
    expect(dataOf(evs, "followup").followUp.source).toBe("template");
  });
});

describe("S10: refine uses the thread's persona", () => {
  it("a Guest thread refined with a Lan cookie still has no wallet saving and no interests", async () => {
    const { threadId } = await heroKit({ persona: "guest" });
    setLLM(new FakeLLM({ structured: [refineOutput(sloppyHeroPlan({ budget: 2_000_000 }))], stream: ["ok"] }));
    const evs = await sseEvents(await refine(post("/api/kit/refine", { threadId, message: "Budget 2M" }, cookieFor("lan"))));
    for (const o of dataOf(evs, "options").options) {
      expect(o.savings.some((s) => s.wallet)).toBe(false);
      expect(o.interests ?? []).toEqual([]);
    }
    expect(eventNames(evs).slice(-2)).toEqual(["followup", "done"]);
  });
});
