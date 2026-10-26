// Ticket 20a — three baskets (Saver / Balanced / Premium) through POST /api/kit and /api/kit/refine with the
// InMemoryAdapter + FakeLLM: one option per profile, ordered totals on the hero fixture, one explainer line per profile.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { KitSseEventSchema, type BasketOption, type KitPlan, type Product, type Shop } from "@/contract";
import { fixtures, kitSample } from "@/contract/fixtures";
import { getAdapter, resetAdapterForTests } from "@/server/adapter";
import { FakeLLM, setLLMForTests } from "@/server/llm";
import { profileLines as buildProfileLines } from "@/server/kit/explainer";
import { optimize } from "@/server/optimizer";
import { formatVnd } from "@/server/optimizer/present";
import { POST as kitPOST } from "@/app/api/kit/route";
import { POST as refinePOST } from "@/app/api/kit/refine/route";

const HERO_PLAN: KitPlan = kitSample.flatMap((e) => (e.event === "plan" ? [e.data.plan] : []))[0];
const THREE = ["saver", "balanced", "premium"] as const;

const req = (url: string, body: unknown) =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

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

function parts(evs: Awaited<ReturnType<typeof readEvents>>) {
  const options = (evs.find((e) => e.event === "options")!.data as { options: BasketOption[] }).options;
  const text = evs
    .filter((e) => e.event === "explanation")
    .map((e) => (e.data as { delta: string }).delta)
    .join("");
  const optimizeDetail = (
    evs.find((e) => e.event === "step" && e.data.id === "optimize" && e.data.status === "done")!.data as {
      detail?: string;
    }
  ).detail;
  return { options, text, optimizeDetail, last: evs.at(-1)! };
}

async function kit(plan: KitPlan, profiles?: readonly string[], prose = ["Balanced kit."]) {
  const llm = new FakeLLM({ structured: [plan], stream: prose });
  setLLMForTests(llm);
  const res = await kitPOST(req("http://localhost/api/kit", { query: "Grade 1 kit, 1.5M", profiles }));
  return { llm, ...parts(await readEvents(res)) };
}

const byProfile = (options: BasketOption[]) => Object.fromEntries(options.map((o) => [o.profile, o]));
const profileLines = (text: string) => text.split("\n").filter((l) => l.trim()).slice(1);

beforeEach(() => resetAdapterForTests());
afterEach(() => setLLMForTests(null));

/** No deadline (Bago/KidZone eligible) + a tag-free backpack and a raincoat: Premium buys dearer, better-rated picks. */
const TRADEOFF_PLAN: KitPlan = {
  ...HERO_PLAN,
  deadline: null,
  budget: 3000000,
  items: [
    { ...HERO_PLAN.items.find((i) => i.key === "backpack")!, mustHaveTags: [], maxUnitPrice: null },
    {
      key: "raincoat",
      needLabel: "Kids raincoat",
      category: "kids-raincoat",
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    },
    HERO_PLAN.items.find((i) => i.key === "shoes")!,
    HERO_PLAN.items.find((i) => i.key === "water-bottle")!,
  ],
};
const label = (plan: KitPlan, k: string) => plan.items.find((i) => i.key === k)!.needLabel;
/** Need labels whose chosen product differs from `base`. */
const differs = (plan: KitPlan, o: BasketOption, base: BasketOption) =>
  o.lines
    .filter((l) => base.lines.find((b) => b.itemKey === l.itemKey)?.product.id !== l.product.id)
    .map((l) => label(plan, l.itemKey));

describe("three baskets on /api/kit", () => {
  it("returns saver, balanced, premium with saver ≤ balanced ≤ premium, all ok and ≤ budget (hero fixture)", async () => {
    const { options, last } = await kit(HERO_PLAN, THREE);
    expect(last.event).toBe("done");
    expect(options.map((o) => o.profile)).toEqual([...THREE]);
    const { saver, balanced, premium } = byProfile(options);
    expect(saver.grandTotal).toBeLessThanOrEqual(balanced.grandTotal);
    expect(balanced.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
    for (const o of options) {
      expect(o.status).toBe("ok");
      expect(o.grandTotal).toBeLessThanOrEqual(HERO_PLAN.budget!);
    }
  });

  it("explainer prose is about Balanced, then one line per profile (hero: all three the same basket)", async () => {
    const { options, text, llm, optimizeDetail } = await kit(HERO_PLAN, THREE);
    const { balanced } = byProfile(options);
    const facts = JSON.parse(llm.calls.find((c) => c.kind === "stream")!.messages.at(-1)!.content);
    expect(facts.profile).toBe("balanced");
    expect(facts.grandTotal).toBe(formatVnd(balanced.grandTotal));
    expect(optimizeDetail).toContain(formatVnd(balanced.grandTotal));

    expect(text.split("\n")[0]).toBe("Balanced kit.");
    const total = formatVnd(balanced.grandTotal);
    expect(profileLines(text)).toEqual([
      `Saver: ${total}, the same as Balanced — no cheaper picks worth taking.`,
      `Balanced: ${total} from ${balanced.shops.length} shops — the best value for the money.`,
      `Premium: ${total}, the same as Balanced — these are already the best-rated picks.`,
    ]);
  });

  it("Premium line says what it costs more and for which needs; Saver ≤ Balanced < Premium", async () => {
    const { options, text } = await kit(TRADEOFF_PLAN, THREE);
    const { saver, balanced, premium } = byProfile(options);
    expect(saver.grandTotal).toBeLessThanOrEqual(balanced.grandTotal);
    expect(balanced.grandTotal).toBeLessThan(premium.grandTotal);
    const better = differs(TRADEOFF_PLAN, premium, balanced);
    expect(better.length).toBeGreaterThan(0);
    expect(profileLines(text)[2]).toBe(
      `Premium costs ${formatVnd(premium.grandTotal - balanced.grandTotal)} more for better-rated ` +
        `${better.join(", ")} — ${formatVnd(premium.grandTotal)} in total.`,
    );
  });

  it("Vietnamese buyer → profile lines in Vietnamese", async () => {
    const { options, text } = await kit({ ...TRADEOFF_PLAN, language: "vi" }, THREE, ["Bộ cân bằng."]);
    const { balanced, premium } = byProfile(options);
    const lines = profileLines(text);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Saver: .+, bằng Balanced/);
    expect(lines[1]).toMatch(/^Balanced: .+ từ \d+ shop/);
    expect(lines[2]).toMatch(/^Premium thêm /);
    expect(lines[2]).toContain(formatVnd(premium.grandTotal - balanced.grandTotal));
    expect(text).not.toMatch(/ saves | costs | the same /);
  });

  it("a single profile (default) keeps the explanation to the prose only", async () => {
    const { options, text } = await kit(HERO_PLAN, undefined, ["Only ", "prose."]);
    expect(options.map((o) => o.profile)).toEqual(["balanced"]);
    expect(text).toBe("Only prose.");
  });

  it("without Balanced the first requested profile is explained and the others are compared to it", async () => {
    const { options, text, llm } = await kit(TRADEOFF_PLAN, ["premium", "saver"]);
    expect(options.map((o) => o.profile)).toEqual(["premium", "saver"]);
    const [premium, saver] = options;
    const facts = JSON.parse(llm.calls.find((c) => c.kind === "stream")!.messages.at(-1)!.content);
    expect(facts.profile).toBe("premium");
    const cheaper = differs(TRADEOFF_PLAN, saver, premium);
    expect(cheaper.length).toBeGreaterThan(0);
    expect(profileLines(text)).toEqual([
      `Premium: ${formatVnd(premium.grandTotal)} from ${premium.shops.length} shops.`,
      `Saver saves ${formatVnd(premium.grandTotal - saver.grandTotal)} by choosing cheaper ` +
        `${cheaper.join(", ")} — ${formatVnd(saver.grandTotal)} in total.`,
    ]);
  });

  it("over-budget baskets say so with their minimum cost instead of a saving", async () => {
    const { options, text } = await kit({ ...HERO_PLAN, budget: 100000 }, THREE);
    for (const o of options) expect(o.status).toBe("over_budget");
    expect(profileLines(text)).toEqual(
      ["Saver", "Balanced", "Premium"].map((n, i) => `${n}: over budget — at least ${formatVnd(options[i].minimumCost!)}.`),
    );
  });
});

describe("profileLines (pure)", () => {
  it("Saver line names the cheaper needs and the saving when it beats Balanced", () => {
    const shop: Shop = { id: "a", name: "Shop A", tier: "regular", rating: 4.5, shipFee: 20000, city: "Hanoi" };
    const prod = (id: string, price: number): Product => ({
      ...fixtures.products[0],
      id,
      shopId: "a",
      title: id,
      category: "notebooks",
      price,
    });
    const item = { ...HERO_PLAN.items.find((i) => i.key === "notebooks")!, maxUnitPrice: null };
    const plan: KitPlan = { ...HERO_PLAN, budget: 1000000, items: [item] };
    const cands = {
      [item.key]: [
        { product: prod("good", 100000), shop, score: 0.95, matchedTags: [], arrivesBy: "2026-08-23" },
        { product: prod("fine", 80000), shop, score: 0.7, matchedTags: [], arrivesBy: "2026-08-23" },
      ],
    };
    const [saver, balanced] = (["saver", "balanced"] as const).map((profile) =>
      optimize({ plan, candidates: cands, shops: [shop], vouchers: [], profile, today: "2026-08-20" }),
    );
    expect(saver.lines[0].product.id).toBe("fine");
    expect(balanced.lines[0].product.id).toBe("good");
    expect(buildProfileLines(plan, [saver, balanced], balanced)).toEqual([
      `Saver saves 20.000₫ by choosing cheaper ${item.needLabel} — ${formatVnd(saver.grandTotal)} in total.`,
      `Balanced: ${formatVnd(balanced.grandTotal)} from 1 shop — the best value for the money.`,
    ]);
  });
});

describe("three baskets on /api/kit/refine", () => {
  it("honours profiles: three ordered options ≤ the new budget and one line per profile", async () => {
    const { sessionId } = await getAdapter().recordIntent({ query: "Grade 1 kit", plan: HERO_PLAN, source: "live" });
    const refined: KitPlan = { ...HERO_PLAN, budget: 1200000 };
    setLLMForTests(new FakeLLM({ structured: [refined], stream: ["Budget lowered."] }));
    const res = await refinePOST(
      req("http://localhost/api/kit/refine", {
        sessionId,
        previousPlan: HERO_PLAN,
        message: "budget 1.2M",
        profiles: THREE,
      }),
    );
    const { options, text, last } = parts(await readEvents(res));
    expect(last.event).toBe("done");
    expect(options.map((o) => o.profile)).toEqual([...THREE]);
    const { saver, balanced, premium } = byProfile(options);
    expect(saver.grandTotal).toBeLessThanOrEqual(balanced.grandTotal);
    expect(balanced.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
    for (const o of options) expect(o.grandTotal).toBeLessThanOrEqual(1200000);
    expect(text.split("\n")[0]).toBe("Budget lowered.");
    expect(profileLines(text).map((l) => l.split(/[ :]/)[0])).toEqual(["Saver", "Balanced", "Premium"]);
  });
});
