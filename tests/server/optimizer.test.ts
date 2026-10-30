// S1 — Basket Optimizer: pure function, money must be right (PRD "Optimizer", CONTRACT §1 "Profiles").
import { describe, expect, it } from "vitest";
import { BasketOptionSchema, type BasketOption, type Candidate } from "@/contract";
import { optimize, optimizeProfile, priceBasket, type OptimizerInput } from "@/server/optimizer";
import { rng } from "@/server/seed/rng";
import { cand, freeship, heroInput, item, plan, shop, sumScore, TODAY, voucher } from "./support/optimizer";

function checkTotals(o: BasketOption) {
  expect(BasketOptionSchema.safeParse(o).success).toBe(true);
  expect(o.grandTotal).toBe(o.itemsTotal + o.shippingTotal - o.discountTotal);
  expect(o.itemsTotal).toBe(o.lines.reduce((s, l) => s + l.lineTotal, 0));
  for (const l of o.lines) expect(l.lineTotal).toBe(l.product.price * l.quantity);
  expect(o.itemsTotal).toBe(o.shops.reduce((s, g) => s + g.subtotal, 0));
  expect(o.shippingTotal).toBe(o.shops.reduce((s, g) => s + g.shipping, 0));
  for (const g of o.shops) {
    const lines = o.lines.filter((l) => l.shop.id === g.shopId);
    expect(lines.length).toBeGreaterThan(0);
    expect(g.subtotal).toBe(lines.reduce((s, l) => s + l.lineTotal, 0));
    expect(g.shipping).toBe(lines[0].shop.shipFee); // once per shop group
  }
  expect(new Set(o.shops.map((g) => g.shopId)).size).toBe(o.shops.length);
  expect(o.savings.reduce((s, x) => s + x.amount, 0)).toBe(o.discountTotal);
  expect(o.savings.every((s) => s.amount > 0)).toBe(true);
  expect(o.grandTotal).toBeGreaterThanOrEqual(0);
}

const byKey = (o: BasketOption, key: string) => o.lines.find((l) => l.itemKey === key);

describe("Optimizer — pricing", () => {
  it("shipping once per shop group; FREESHIP covers up to its value when the group subtotal ≥ min spend", () => {
    const A = shop("a", 40_000);
    const B = shop("b", 15_000);
    const input: OptimizerInput = {
      plan: plan([item("x"), item("y"), item("z")], 1_000_000),
      candidates: { x: [cand(A, 150_000, 0.5)], y: [cand(A, 60_000, 0.5)], z: [cand(B, 100_000, 0.5)] },
      shops: [A, B],
      vouchers: [freeship()],
      today: TODAY,
    };
    for (const o of optimize(input)) {
      checkTotals(o);
      expect(o.itemsTotal).toBe(310_000);
      expect(o.shippingTotal).toBe(55_000);
      const ga = o.shops.find((g) => g.shopId === "a")!;
      const gb = o.shops.find((g) => g.shopId === "b")!;
      expect(ga.voucherCodes).toEqual(["FREESHIP"]);
      expect(gb.voucherCodes).toEqual([]); // 100k < 200k min spend
      expect(o.discountTotal).toBe(30_000); // capped at the voucher value, not the 40k fee
      expect(o.grandTotal).toBe(335_000);
      expect(o.savings).toEqual([{ label: "Free shipping at Shop a", amount: 30_000 }]);
    }
  });

  it("FREESHIP never covers more than the shop fee", () => {
    const A = shop("a", 12_000);
    const input: OptimizerInput = {
      plan: plan([item("x")], 1_000_000),
      candidates: { x: [cand(A, 250_000, 0.5)] },
      shops: [A],
      vouchers: [freeship()],
      today: TODAY,
    };
    const o = optimizeProfile(input, "saver");
    expect(o.discountTotal).toBe(12_000);
    expect(o.grandTotal).toBe(250_000);
  });

  it("at most one platform discount voucher (the best eligible), at most one shop voucher per shop, min spend respected", () => {
    const A = shop("a", 20_000);
    const B = shop("b", 20_000);
    const vouchers = [
      voucher({ code: "BIG50", scope: "platform", kind: "fixed", value: 50_000, minSpend: 1_000_000 }),
      voucher({ code: "SAVE5", scope: "platform", kind: "percent", value: 5, maxDiscount: 40_000, minSpend: 500_000 }),
      voucher({ code: "TINY5K", scope: "platform", kind: "fixed", value: 5_000, minSpend: 0 }),
      voucher({ code: "A30", scope: "shop", shopId: "a", kind: "fixed", value: 30_000, minSpend: 300_000 }),
      voucher({
        code: "A10P",
        scope: "shop",
        shopId: "a",
        kind: "percent",
        value: 10,
        maxDiscount: 25_000,
        minSpend: 100_000,
      }),
      voucher({ code: "B40", scope: "shop", shopId: "b", kind: "fixed", value: 40_000, minSpend: 300_000 }),
    ];
    const input: OptimizerInput = {
      plan: plan([item("x"), item("y")], 2_000_000),
      candidates: { x: [cand(A, 400_000, 0.5)], y: [cand(B, 200_000, 0.5)] },
      shops: [A, B],
      vouchers,
      today: TODAY,
    };
    const o = optimizeProfile(input, "balanced");
    checkTotals(o);
    // items 600k: SAVE5 = 30k beats TINY5K; BIG50 needs 1M. Shop a: A30 (30k) beats A10P (10% = 40k capped 25k). B40 needs 300k.
    expect(o.shops.find((g) => g.shopId === "a")).toMatchObject({ shopDiscount: 30_000, voucherCodes: ["A30"] });
    expect(o.shops.find((g) => g.shopId === "b")).toMatchObject({ shopDiscount: 0, voucherCodes: [] });
    expect(o.discountTotal).toBe(60_000);
    expect(o.grandTotal).toBe(600_000 + 40_000 - 60_000);
    expect(o.savings.map((s) => s.amount)).toEqual([30_000, 30_000]);
    expect(o.savings.some((s) => s.label.includes("SAVE5"))).toBe(true);
    expect(o.savings.some((s) => s.label.includes("BIG50") || s.label.includes("TINY5K"))).toBe(false);
  });

  it("expired vouchers (validUntil < today) are ignored", () => {
    const A = shop("a", 20_000);
    const input: OptimizerInput = {
      plan: plan([item("x")], 1_000_000),
      candidates: { x: [cand(A, 300_000, 0.5)] },
      shops: [A],
      vouchers: [voucher({ code: "OLD", scope: "platform", kind: "fixed", value: 50_000, validUntil: "2026-09-01" })],
      today: TODAY,
    };
    expect(optimizeProfile(input, "saver").discountTotal).toBe(0);
  });

  it("a basket with no vouchers / no freeship has savings: []", () => {
    const A = shop("a", 20_000);
    const input: OptimizerInput = {
      plan: plan([item("x"), item("y")], 1_000_000),
      candidates: { x: [cand(A, 300_000, 0.5)], y: [cand(A, 100_000, 0.9), cand(shop("b"), 90_000, 0.4)] },
      shops: [A, shop("b")],
      vouchers: [],
      today: TODAY,
    };
    for (const o of optimize(input)) {
      checkTotals(o);
      expect(o.savings).toEqual([]);
      expect(o.discountTotal).toBe(0);
    }
  });
});

describe("Optimizer — wallet vouchers (D46)", () => {
  it("LAN-BTS10 is used instead of SAVE5 on a ≥ 500k basket, labelled as the buyer's wallet voucher", async () => {
    const lan = await heroInput(3_000_000, "lan");
    const withWallet = optimize(lan);
    const without = optimize({ ...lan, vouchers: lan.vouchers.filter((v) => v.code !== "LAN-BTS10") });
    for (const [i, o] of withWallet.entries()) {
      checkTotals(o);
      expect(o.itemsTotal).toBeGreaterThanOrEqual(500_000);
      const wallet = o.savings.filter((s) => s.wallet);
      expect(wallet.some((s) => s.label === "Your wallet voucher Back-to-school 10%")).toBe(true);
      expect(wallet.every((s) => s.label.startsWith("Your wallet voucher"))).toBe(true);
      expect(o.savings.some((s) => s.label.includes("SAVE5") || s.label.includes("KITLY50"))).toBe(false);
      if (o.profile === "saver") expect(without[i].grandTotal).toBeGreaterThan(o.grandTotal);
    }
    // the public savings never carry wallet: true
    for (const o of without) expect(o.savings.filter((s) => s.label.includes("Back-to-school")).length).toBe(0);
  });

  it("wallet shop voucher competes with the shop's public vouchers; vi label 'Voucher trong ví của bạn'", async () => {
    const lan = await heroInput(3_000_000, "lan");
    lan.plan.language = "vi";
    const premium = optimizeProfile(lan, "premium");
    const kz = premium.shops.find((g) => g.shopId === "shop-kidzone")!;
    expect(kz.voucherCodes).toContain("LAN-KZ80"); // 80k beats KIDZONE10 (10% max 50k)
    expect(kz.voucherCodes).not.toContain("KIDZONE10");
    const w = premium.savings.filter((s) => s.wallet);
    expect(w.length).toBe(2);
    expect(w.every((s) => s.label.startsWith("Voucher trong ví của bạn"))).toBe(true);
  });
});

describe("Optimizer — item set, noMatch, over budget", () => {
  it("must-haves are chosen before nice-to-haves; nice-to-haves dropped for budget appear in skipped", () => {
    const A = shop("a", 0);
    const p = plan(
      [item("must1"), item("nice-cheap", { required: false }), item("must2"), item("nice-pricey", { required: false })],
      500_000,
    );
    const input: OptimizerInput = {
      plan: p,
      candidates: {
        must1: [cand(A, 200_000, 0.5)],
        must2: [cand(A, 150_000, 0.5)],
        "nice-cheap": [cand(A, 100_000, 0.6)], // 0.6 per 100k
        "nice-pricey": [cand(A, 140_000, 0.6)], // lower score per ₫ → dropped first
      },
      shops: [A],
      vouchers: [],
      today: TODAY,
    };
    for (const o of optimize(input)) {
      checkTotals(o);
      expect(o.status).toBe("ok");
      expect(o.lines.map((l) => l.itemKey)).toEqual(["must1", "nice-cheap", "must2"]); // plan order
      expect(o.skipped).toEqual([{ itemKey: "nice-pricey", needLabel: "Nice-pricey", reason: "budget" }]);
      expect(o.grandTotal).toBeLessThanOrEqual(500_000);
    }
  });

  it("the same item set is used for every profile", async () => {
    const hero = await heroInput(1_000_000, "guest");
    const keys = optimize(hero).map((o) => o.lines.map((l) => l.itemKey).join(","));
    expect(new Set(keys).size).toBe(1);
  });

  it("items with no candidate → noMatch with the Matcher's reason; uncovered items not passed in get one too", () => {
    const A = shop("a", 10_000);
    const closest = { candidate: cand(A, 500_000, 0.4), missingTags: ["anti-hunchback"], overMaxPriceBy: null };
    const input: OptimizerInput = {
      plan: plan(
        [item("backpack", { mustHaveTags: ["anti-hunchback"] }), item("pens"), item("dogfood", { category: null })],
        1_000_000,
      ),
      candidates: { pens: [cand(A, 30_000, 0.5)] },
      noMatch: [{ itemKey: "backpack", needLabel: "Backpack", reason: "no_product_with_tags", closest }],
      shops: [A],
      vouchers: [],
      today: TODAY,
    };
    for (const o of optimize(input)) {
      expect(o.lines.map((l) => l.itemKey)).toEqual(["pens"]);
      expect(o.noMatch).toEqual([
        { itemKey: "backpack", needLabel: "Backpack", reason: "no_product_with_tags", closest },
        { itemKey: "dogfood", needLabel: "Dogfood", reason: "no_category", closest: null },
      ]);
      // the closest product is never put in the basket automatically
      expect(o.lines.some((l) => l.product.id === closest.candidate.product.id)).toBe(false);
    }
  });

  it("late candidates (arrivesBy after the deadline) are never chosen", () => {
    const A = shop("a", 0);
    const late = cand(A, 10_000, 0.99, { shipDaysMax: 9 });
    const ontime = cand(A, 50_000, 0.3);
    const input: OptimizerInput = {
      plan: plan([item("x")], 1_000_000),
      candidates: { x: [late, ontime] },
      shops: [A],
      vouchers: [],
      today: TODAY,
    };
    for (const o of optimize(input)) {
      expect(byKey(o, "x")!.product.id).toBe(ontime.product.id);
      expect(o.lines[0].alternatives.map((a) => a.product.id)).not.toContain(late.product.id);
    }
  });

  it("must-haves alone over budget ⇒ over_budget with minimumCost, top-3 costDrivers, overBy and fit", () => {
    const A = shop("a", 20_000);
    const B = shop("b", 30_000);
    const input: OptimizerInput = {
      plan: plan(
        [
          item("w", { needLabel: "Water bottle" }),
          item("l", { needLabel: "Lunch box" }),
          item("n", { needLabel: "Notebooks" }),
          item("s", { needLabel: "Shoes" }),
          item("c", { needLabel: "Crayons", required: false }),
        ],
        300_000,
      ),
      candidates: {
        w: [cand(A, 90_000, 0.5), cand(B, 190_000, 0.9)],
        l: [cand(A, 100_000, 0.5)],
        n: [cand(A, 45_000, 0.5)],
        s: [cand(A, 120_000, 0.5)],
        c: [cand(A, 55_000, 0.5)],
      },
      shops: [A, B],
      vouchers: [freeship()],
      today: TODAY,
    };
    const opts = optimize(input);
    for (const o of opts) {
      checkTotals(o);
      expect(o.status).toBe("over_budget");
      // cheapest must-have basket: 90+100+45+120 = 355k + 20k ship − 20k freeship
      expect(o.grandTotal).toBe(355_000);
      expect(o.minimumCost).toBe(355_000);
      expect(o.overBy).toBe(55_000);
      expect(o.costDrivers).toEqual(["Shoes", "Lunch box", "Water bottle"]);
      expect(o.skipped).toEqual([{ itemKey: "c", needLabel: "Crayons", reason: "budget" }]);
      expect(o.fit!.length).toBeGreaterThanOrEqual(1);
      expect(o.fit!.length).toBeLessThanOrEqual(2);
      expect(o.fit!.some((f) => f.fits && f.dropsMustHave)).toBe(true);
    }
  });

  it("budget null ⇒ never over_budget, keeps every item, premium = highest Σscore", () => {
    const A = shop("a", 20_000);
    const B = shop("b", 20_000);
    const input: OptimizerInput = {
      plan: plan([item("x"), item("y", { required: false })], null),
      candidates: {
        x: [cand(A, 5_000_000, 0.95), cand(B, 100_000, 0.4)],
        y: [cand(A, 2_000_000, 0.9), cand(B, 50_000, 0.3)],
      },
      shops: [A, B],
      vouchers: [],
      today: TODAY,
    };
    const [saver, balanced, premium] = optimize(input);
    for (const o of [saver, balanced, premium]) {
      checkTotals(o);
      expect(o.status).toBe("ok");
      expect(o.skipped).toEqual([]);
      expect(o.lines).toHaveLength(2);
      expect(o.overBy).toBeUndefined();
    }
    expect(premium.lines.map((l) => l.product.price)).toEqual([5_000_000, 2_000_000]);
    expect(saver.lines.map((l) => l.product.price)).toEqual([100_000, 50_000]);
  });
});

describe("Optimizer — consolidation and alternatives", () => {
  it("picks the near-equal candidate at a shop already in the basket when it lowers the total, and a savings line explains it", () => {
    const X = shop("x", 25_000);
    const Y = shop("y", 20_000);
    const atX = cand(X, 60_000, 0.7);
    const atY = cand(Y, 55_000, 0.71);
    const input: OptimizerInput = {
      plan: plan([item("big"), item("small")], 1_000_000),
      candidates: { big: [cand(X, 150_000, 0.6)], small: [atY, atX] },
      shops: [X, Y],
      vouchers: [freeship()],
      today: TODAY,
    };
    // premium is strictly "highest Σscore" (0.71 wins there); saver and balanced take the cheaper consolidated basket
    for (const o of optimize(input, ["saver", "balanced"])) {
      checkTotals(o);
      expect(byKey(o, "small")!.product.id).toBe(atX.product.id);
      expect(o.shops).toHaveLength(1);
      expect(o.grandTotal).toBe(210_000); // 210k + 25k ship − 25k FREESHIP (vs 205k + 45k ship split)
      expect(o.savings).toEqual([{ label: "Free shipping at Shop x", amount: 25_000 }]);
      expect(byKey(o, "small")!.reason).toMatch(/Shop x/);
    }
  });

  it("consolidation is chosen to save a second shipping fee even with no voucher (no hypothetical savings line)", () => {
    const X = shop("x", 25_000);
    const Y = shop("y", 20_000);
    const atX = cand(X, 60_000, 0.7);
    const atY = cand(Y, 55_000, 0.7);
    const input: OptimizerInput = {
      plan: plan([item("big"), item("small")], 1_000_000),
      candidates: { big: [cand(X, 150_000, 0.6)], small: [atY, atX] },
      shops: [X, Y],
      vouchers: [],
      today: TODAY,
    };
    const o = optimizeProfile(input, "saver");
    expect(byKey(o, "small")!.product.id).toBe(atX.product.id);
    expect(o.savings).toEqual([]);
  });

  it("alternatives: up to 2 next-best candidates from other shops per line", () => {
    const [A, B, C, D] = ["a", "b", "c", "d"].map((id) => shop(id, 10_000));
    const cs = [
      cand(A, 100_000, 0.9),
      cand(A, 90_000, 0.8),
      cand(B, 95_000, 0.7),
      cand(C, 80_000, 0.6),
      cand(D, 70_000, 0.5),
    ];
    const input: OptimizerInput = {
      plan: plan([item("x")], 1_000_000),
      candidates: { x: cs },
      shops: [A, B, C, D],
      vouchers: [],
      today: TODAY,
    };
    for (const o of optimize(input)) {
      const line = o.lines[0];
      expect(line.alternatives.length).toBeLessThanOrEqual(2);
      expect(line.alternatives.length).toBe(2);
      expect(line.alternatives.every((a) => a.shop.id !== line.shop.id)).toBe(true);
      expect(new Set(line.alternatives.map((a) => a.shop.id)).size).toBe(2);
      const scores = line.alternatives.map((a) => a.score);
      expect(scores).toEqual([...scores].sort((p, q) => q - p));
    }
    const premium = optimizeProfile(input, "premium");
    expect(premium.lines[0].alternatives.map((a) => a.shop.id)).toEqual(["b", "c"]);
  });
});

describe("Optimizer — profiles (D34) on the hero fixture", () => {
  it("budget 3,000,000: saver ≤ balanced ≤ premium in grandTotal, premium Σscore > saver Σscore, ≥ 2 lines differ, all ≤ budget", async () => {
    for (const persona of ["lan", "guest"] as const) {
      const hero = await heroInput(3_000_000, persona);
      const [saver, balanced, premium] = optimize(hero);
      expect([saver.profile, balanced.profile, premium.profile]).toEqual(["saver", "balanced", "premium"]);
      for (const o of [saver, balanced, premium]) {
        checkTotals(o);
        expect(o.status).toBe("ok");
        expect(o.grandTotal).toBeLessThanOrEqual(3_000_000);
        expect(o.noMatch.map((n) => n.itemKey)).toEqual(["backpack"]);
      }
      expect(saver.grandTotal).toBeLessThanOrEqual(balanced.grandTotal);
      expect(balanced.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
      expect(sumScore(premium.lines, hero)).toBeGreaterThan(sumScore(saver.lines, hero));
      const differ = premium.lines.filter((l) => byKey(saver, l.itemKey)!.product.id !== l.product.id).length;
      expect(differ).toBeGreaterThanOrEqual(2);
    }
  });

  it("budget 1,000,000: every profile is still ≤ budget", async () => {
    for (const persona of ["lan", "guest"] as const) {
      const hero = await heroInput(1_000_000, persona);
      for (const o of optimize(hero)) {
        checkTotals(o);
        expect(o.status).toBe("ok");
        expect(o.grandTotal).toBeLessThanOrEqual(1_000_000);
      }
    }
  });

  it("is deterministic and returns only the requested profiles, in the requested order", async () => {
    const hero = await heroInput(1_500_000);
    expect(optimize(hero)).toEqual(optimize(hero));
    const two = optimize(hero, ["premium", "saver"]);
    expect(two.map((o) => o.profile)).toEqual(["premium", "saver"]);
    expect(two[1]).toEqual(optimizeProfile(hero, "saver"));
  });

  it("score is quality only: a candidate's score is never changed by the optimizer", async () => {
    const hero = await heroInput(3_000_000);
    const premium = optimizeProfile(hero, "premium");
    for (const l of premium.lines) {
      for (const a of l.alternatives) {
        const orig = hero.candidates[l.itemKey].find((c) => c.product.id === a.product.id)!;
        expect(a.score).toBe(orig.score);
      }
    }
  });
});

// ---- Full: property + performance ----
function randomInput(seed: number): OptimizerInput {
  const r = rng(seed);
  const shops = Array.from({ length: r.int(1, 4) }, (_, i) => shop(`s${i}`, r.int(0, 4) * 10_000));
  const items = Array.from({ length: r.int(1, 5) }, (_, i) =>
    item(`i${i}`, { required: r.next() < 0.6, quantity: r.int(1, 3) }),
  );
  const candidates: Record<string, Candidate[]> = {};
  for (const it of items) {
    if (r.next() < 0.1) continue; // uncovered item
    candidates[it.key] = Array.from({ length: r.int(1, 4) }, () =>
      cand(r.pick(shops), r.int(1, 60) * 10_000, Math.round(r.next() * 100) / 100),
    );
  }
  const vouchers = [
    ...(r.next() < 0.7 ? [freeship()] : []),
    ...(r.next() < 0.5
      ? [voucher({ code: "P5", scope: "platform", kind: "percent", value: 5, maxDiscount: 40_000, minSpend: 300_000 })]
      : []),
    ...(r.next() < 0.5
      ? [voucher({ code: "P50", scope: "platform", kind: "fixed", value: 50_000, minSpend: 800_000 })]
      : []),
    ...shops
      .filter(() => r.next() < 0.5)
      .map((s) =>
        voucher({ code: `S-${s.id}`, scope: "shop", shopId: s.id, kind: "fixed", value: 20_000, minSpend: 200_000 }),
      ),
    ...(r.next() < 0.3
      ? [
          voucher({
            code: "W10",
            scope: "platform",
            kind: "percent",
            value: 10,
            maxDiscount: 100_000,
            minSpend: 500_000,
            ownerPersona: "lan",
            label: "W 10%",
          }),
        ]
      : []),
  ];
  const budget = r.next() < 0.15 ? null : r.int(1, 30) * 50_000;
  return { plan: plan(items, budget), candidates, shops, vouchers, today: TODAY };
}

describe("Optimizer — property (Full)", () => {
  it("random small inputs: totals add up, status ok ⇒ ≤ budget, saver ≤ balanced ≤ premium, saver is the true minimum", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const input = randomInput(seed);
      const [saver, balanced, premium] = optimize(input);
      for (const o of [saver, balanced, premium]) {
        checkTotals(o);
        if (o.status === "ok" && input.plan.budget !== null)
          expect(o.grandTotal).toBeLessThanOrEqual(input.plan.budget);
        if (o.status === "over_budget") expect(o.overBy).toBe(o.grandTotal - input.plan.budget!);
        expect(o.status).toBe(saver.status);
        expect(o.lines.map((l) => l.itemKey)).toEqual(saver.lines.map((l) => l.itemKey));
      }
      if (saver.status !== "ok") continue;
      expect(saver.grandTotal).toBeLessThanOrEqual(balanced.grandTotal);
      expect(balanced.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
      expect(sumScore(premium.lines, input)).toBeGreaterThanOrEqual(sumScore(saver.lines, input) - 1e-9);
      // brute force over the chosen item set: no cheaper basket exists
      const keys = saver.lines.map((l) => l.itemKey);
      let best = Infinity;
      const walk = (i: number, picks: Record<string, Candidate>) => {
        if (i === keys.length) {
          best = Math.min(best, priceBasket(input, picks).grandTotal);
          return;
        }
        for (const c of input.candidates[keys[i]]) walk(i + 1, { ...picks, [keys[i]]: c });
      };
      walk(0, {});
      expect(saver.grandTotal).toBe(best);
    }
  });

  it("performance: 12 items × 8 candidates, budget 5,000,000 runs < 200 ms", () => {
    const r = rng(42);
    const shops = Array.from({ length: 6 }, (_, i) =>
      shop(`s${i}`, 15_000 + i * 5_000, (["mall", "preferred", "regular"] as const)[i % 3]),
    );
    const items = Array.from({ length: 12 }, (_, i) => item(`i${i}`, { required: i < 8 }));
    const candidates: Record<string, Candidate[]> = {};
    for (const it of items) {
      candidates[it.key] = Array.from({ length: 8 }, (_, j) =>
        cand(shops[(j + r.int(0, 5)) % 6], r.int(5, 80) * 10_000, Math.round(r.next() * 100) / 100),
      );
    }
    const vouchers = [
      freeship(),
      voucher({ code: "SAVE5", scope: "platform", kind: "percent", value: 5, maxDiscount: 40_000, minSpend: 500_000 }),
      ...shops.map((s) =>
        voucher({ code: `S-${s.id}`, scope: "shop", shopId: s.id, kind: "fixed", value: 30_000, minSpend: 300_000 }),
      ),
    ];
    const input: OptimizerInput = { plan: plan(items, 5_000_000), candidates, shops, vouchers, today: TODAY };
    optimize(input); // warm up the JIT
    const t0 = performance.now();
    const opts = optimize(input);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(200);
    for (const o of opts) {
      checkTotals(o);
      expect(o.status).toBe("ok");
      expect(o.grandTotal).toBeLessThanOrEqual(5_000_000);
    }
    expect(opts[0].grandTotal).toBeLessThanOrEqual(opts[1].grandTotal);
    expect(opts[1].grandTotal).toBeLessThanOrEqual(opts[2].grandTotal);
  });
});
