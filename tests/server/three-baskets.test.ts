// Ticket 20a — three baskets, backend. Seams: the Kit Pipeline (runNewKit on an InMemoryAdapter + InMemoryKitStore +
// FakeLLM), the /api/kit/refine and /api/kit/adjust routes (profiles parameter) and the Explainer prompt (comparison line).
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { BasketOption, KitPlan, KitStreamEvent, Product } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { InMemoryKitStore } from "@/server/kitstore/in-memory";
import { FakeLLM, setLLM } from "@/server/llm";
import { runNewKit, type KitDeps } from "@/server/kit/pipeline";
import { explainerMessages } from "@/server/kit/explainer";
import { POST as newKit } from "@/app/api/kit/route";
import { POST as refine } from "@/app/api/kit/refine/route";
import { POST as adjust } from "@/app/api/kit/adjust/route";
import productsFixture from "@/contract/fixtures/products.json";
import { HERO, refineOutput, sloppyHeroPlan } from "./support/plans";
import { dataOf, sseEvents } from "./support/sse";

const TODAY = "2026-09-02";
const HERO_CATEGORIES = [
  "school-backpack",
  "notebooks",
  "pencils-pens",
  "pencil-case",
  "water-bottle",
  "lunch-box",
  "school-shoes",
  "uniform-shirt",
  "book-covers",
];

/**
 * The fixture catalog deepened to ≥ 5 products per hero category: each category gets variants of its fixture products
 * (same tags and shop, other price / rating / reviews), from cheap-and-plain to pricey-and-top-rated.
 */
function deepCatalog(): Product[] {
  const base = productsFixture as Product[];
  const out: Product[] = [];
  const variants = [
    { price: 0.7, rating: 4.1, reviews: 40 },
    { price: 1.25, rating: 4.7, reviews: 900 },
    { price: 1.6, rating: 5.0, reviews: 2500 },
    { price: 0.85, rating: 4.4, reviews: 150 },
  ];
  for (const cat of HERO_CATEGORIES) {
    const own = base.filter((p) => p.category === cat);
    variants.forEach((v, i) => {
      const src = own[i % own.length];
      out.push({
        ...src,
        id: `${src.id}-v${i}`,
        title: `${src.title} (variant ${i + 1})`,
        price: Math.round((src.price * v.price) / 1000) * 1000,
        rating: v.rating,
        reviewCount: v.reviews,
      });
    });
  }
  return out;
}

function deps(llm: FakeLLM, adapter = new InMemoryAdapter({ extraProducts: deepCatalog() })): KitDeps {
  return { adapter, store: new InMemoryKitStore(), llm, today: TODAY };
}

async function run(plan: object, profiles?: ("saver" | "balanced" | "premium")[], adapter?: InMemoryAdapter) {
  const llm = new FakeLLM({ structured: [plan], stream: ["Balanced fits. ", "Saver is cheaper."] });
  const evs: KitStreamEvent[] = [];
  await runNewKit(deps(llm, adapter), { owner: "owner-3b", persona: "lan", query: HERO, profiles }, (e) => evs.push(e));
  return { llm, evs, options: dataOf(evs, "options").options };
}
const productIds = (o: BasketOption) => o.lines.map((l) => `${l.itemKey}:${l.product.id}`).sort();

describe("Three baskets: pipeline on a catalog with ≥ 5 products per hero category", () => {
  it("the deepened catalog really has ≥ 5 products per hero category", async () => {
    const adapter = new InMemoryAdapter({ extraProducts: deepCatalog() });
    for (const category of HERO_CATEGORIES) {
      const found = await adapter.searchProducts({ category });
      expect(found.length, category).toBeGreaterThanOrEqual(5);
    }
  });

  it("budget 3,000,000: three options, saver ≤ balanced ≤ premium, all ≤ budget, premium ≠ saver", async () => {
    const { options } = await run(sloppyHeroPlan({ budget: 3_000_000 }));
    expect(options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
    const [saver, balanced, premium] = options;
    for (const o of options) {
      expect(o.status).toBe("ok");
      expect(o.grandTotal).toBeLessThanOrEqual(3_000_000);
    }
    expect(saver.grandTotal).toBeLessThanOrEqual(balanced.grandTotal);
    expect(balanced.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
    expect(productIds(premium)).not.toEqual(productIds(saver));
  });

  it("all three profiles by default; only the requested ones when profiles is given", async () => {
    expect((await run(sloppyHeroPlan({ budget: 3_000_000 }))).options).toHaveLength(3);
    const two = await run(sloppyHeroPlan({ budget: 3_000_000 }), ["premium", "saver"]);
    expect(two.options.map((o) => o.profile)).toEqual(["premium", "saver"]);
  });

  it("the explainer gets the Balanced basket plus one comparison line per other basket", async () => {
    const { llm, options } = await run(sloppyHeroPlan({ budget: 3_000_000 }));
    const [saver, balanced, premium] = options;
    const call = llm.calls.find((c) => c.kind === "stream")!;
    const [system, user] = call.messages;
    expect(system.content).toContain("70 words");
    expect(system.content).toMatch(/one short (line|sentence) on how Saver and Premium differ/i);
    const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "₫";
    expect(user.content).toContain(`Total: ${fmt(balanced.grandTotal)}`);
    expect(user.content).toContain(`Saver basket: ${fmt(balanced.grandTotal - saver.grandTotal)} less than Balanced`);
    expect(user.content).toContain(`Premium basket: ${fmt(premium.grandTotal - balanced.grandTotal)} more than Balanced`);
  });
});

describe("Three baskets: identical baskets stay separate options", () => {
  it("a one-item plan with a single product: three identical baskets, three options (merging is the UI's job)", async () => {
    const plan: KitPlan = {
      event: "back_to_school",
      language: "en",
      budget: 1_000_000,
      deadline: "2026-09-05",
      items: [
        {
          key: "lamp",
          needLabel: "Desk lamp",
          category: "kids-desk-lamp",
          required: true,
          quantity: 1,
          mustHaveTags: [],
          niceToHaveTags: [],
          maxUnitPrice: null,
        },
      ],
      assumptions: [],
    };
    const { llm, options } = await run(plan, undefined, new InMemoryAdapter());
    expect(options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
    expect(productIds(options[0])).toEqual(productIds(options[1]));
    expect(productIds(options[1])).toEqual(productIds(options[2]));
    const user = llm.calls.find((c) => c.kind === "stream")!.messages[1].content;
    expect(user).toContain("Saver basket: same as Balanced");
    expect(user).toContain("Premium basket: same as Balanced");
  });
});

describe("Three baskets: explainer comparison facts", () => {
  it("names the items whose product differs from Balanced; no comparison without other baskets", async () => {
    const { options } = await run(sloppyHeroPlan({ budget: 3_000_000 }));
    const plan = sloppyHeroPlan({ budget: 3_000_000 }) as unknown as KitPlan;
    const [saver, balanced, premium] = options;
    const user = explainerMessages(plan, balanced, undefined, undefined, [saver, balanced, premium])[1].content;
    const label = (k: string) => plan.items.find((i) => i.key === k)!.needLabel;
    const differs = (o: BasketOption) =>
      o.lines.filter((l) => balanced.lines.find((b) => b.itemKey === l.itemKey)?.product.id !== l.product.id);
    const saverLine = user.split("\n").find((l) => l.startsWith("Saver basket:"))!;
    for (const l of differs(saver)) expect(saverLine).toContain(label(l.itemKey));
    const premiumLine = user.split("\n").find((l) => l.startsWith("Premium basket:"))!;
    for (const l of differs(premium)) expect(premiumLine).toContain(label(l.itemKey));
    expect(explainerMessages(plan, balanced)[1].content).not.toContain("Saver basket");
    expect(explainerMessages(plan, balanced)[0].content).not.toMatch(/Saver and Premium/);
    // without a Balanced basket (profiles subset) the explained option is not Balanced: no "vs Balanced" lines
    expect(explainerMessages(plan, premium, undefined, undefined, [premium, saver])[1].content).not.toContain("Saver basket");
  });
});

// ---- routes: refine and adjust honour `profiles` ----
const OWNER = "owner-3b-routes";
function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `kitly_uid=${OWNER}` },
  });
}
async function heroThread() {
  setLLM(new FakeLLM({ structured: [sloppyHeroPlan()], stream: ["Version one."] }));
  return dataOf(await sseEvents(await newKit(post("/api/kit", { query: HERO }))), "done").threadId;
}
afterEach(() => setLLM(null));

describe("Three baskets: refine and adjust honour profiles", () => {
  it("refine with profiles → one option per requested profile; without → all three", async () => {
    const threadId = await heroThread();
    setLLM(new FakeLLM({ structured: [refineOutput(sloppyHeroPlan({ budget: 2_000_000 }))], stream: ["ok"] }));
    const evs = await sseEvents(await refine(post("/api/kit/refine", { threadId, message: "budget 2M", profiles: ["balanced"] })));
    expect(dataOf(evs, "options").options.map((o) => o.profile)).toEqual(["balanced"]);
    setLLM(new FakeLLM({ structured: [refineOutput(sloppyHeroPlan({ budget: 2_500_000 }))], stream: ["ok"] }));
    const all = await sseEvents(await refine(post("/api/kit/refine", { threadId, message: "budget 2.5M" })));
    expect(dataOf(all, "options").options.map((o) => o.profile)).toEqual(["saver", "balanced", "premium"]);
  });

  it("adjust with profiles → the new version has one option per requested profile", async () => {
    const threadId = await heroThread();
    setLLM(new FakeLLM());
    const res = await adjust(
      post("/api/kit/adjust", { threadId, change: { type: "set_budget", budget: 2_000_000 }, profiles: ["saver", "premium"] }),
    );
    expect(res.status).toBe(200);
    const { version } = await res.json();
    expect(version.options.map((o: BasketOption) => o.profile)).toEqual(["saver", "premium"]);
  });
});
