// S1 — fitToBudget (D29): code-computed ways back under budget, shared with ticket 09's priceSelection.
import { describe, expect, it } from "vitest";
import { FitSuggestionSchema, type Candidate, type FitSuggestion } from "@/contract";
import { fitToBudget, priceBasket, type OptimizerInput } from "@/server/optimizer";
import { cand, freeship, item, plan, shop, TODAY, voucher } from "./support/optimizer";

const A = shop("a", 0);

function world(
  items: ReturnType<typeof item>[],
  budget: number,
  candidates: Record<string, Candidate[]>,
  language: "en" | "vi" = "en",
) {
  const input: OptimizerInput = {
    plan: plan(items, budget, language),
    candidates,
    shops: [A],
    vouchers: [],
    today: TODAY,
  };
  return input;
}

/** Re-price a basket with the suggestion applied. */
function apply(input: OptimizerInput, picks: Record<string, Candidate>, f: FitSuggestion) {
  const next: Record<string, Candidate> = {};
  for (const [k, c] of Object.entries(picks)) {
    if (f.removeItemKeys.includes(k)) continue;
    const swap = f.swaps.find((s) => s.itemKey === k);
    next[k] = swap ? input.candidates[k].find((x) => x.product.id === swap.productId)! : c;
  }
  return priceBasket(input, next);
}

function checkAll(input: OptimizerInput, picks: Record<string, Candidate>, fits: FitSuggestion[]) {
  expect(fits.length).toBeLessThanOrEqual(2);
  for (const f of fits) {
    expect(FitSuggestionSchema.safeParse(f).success).toBe(true);
    expect(f.grandTotal).toBe(apply(input, picks, f).grandTotal);
    expect(f.fits).toBe(f.grandTotal <= input.plan.budget!);
  }
  expect(new Set(fits.map((f) => f.id)).size).toBe(fits.length);
}

describe("fitToBudget", () => {
  it("returns [] when the basket already fits", () => {
    const m = cand(A, 100_000, 0.5);
    const input = world([item("m")], 500_000, { m: [m] });
    expect(fitToBudget(input, { picks: { m } })).toEqual([]);
  });

  it("drops 'Add anyway' items first", () => {
    const m = cand(A, 300_000, 0.5);
    const n = cand(A, 100_000, 0.1);
    const aa = cand(A, 250_000, 0.9);
    const input = world([item("m"), item("n", { required: false }), item("aa", { needLabel: "Backpack" })], 500_000, {
      m: [m],
      n: [n],
      aa: [],
    });
    const picks = { m, n, aa };
    const fits = fitToBudget(input, { picks, addedAnyway: ["aa"] });
    checkAll(input, picks, fits);
    expect(fits[0]).toMatchObject({
      removeItemKeys: ["aa"],
      swaps: [],
      grandTotal: 400_000,
      fits: true,
      dropsMustHave: false,
    });
    expect(fits[0].label).toBe("Drop Backpack: 400.000₫");
  });

  it("then nice-to-haves, lowest score per ₫ first", () => {
    const m = cand(A, 300_000, 0.5);
    const n1 = cand(A, 100_000, 0.6);
    const n2 = cand(A, 150_000, 0.6);
    const input = world(
      [
        item("m"),
        item("n1", { required: false, needLabel: "Crayons" }),
        item("n2", { required: false, needLabel: "Lunch box" }),
      ],
      420_000,
      { m: [m], n1: [n1], n2: [n2] },
    );
    const picks = { m, n1, n2 };
    const fits = fitToBudget(input, { picks });
    checkAll(input, picks, fits);
    expect(fits[0]).toMatchObject({
      removeItemKeys: ["n2"],
      swaps: [],
      grandTotal: 400_000,
      fits: true,
      dropsMustHave: false,
    });
  });

  it("then swaps lines to their cheapest alternative (labels en + vi)", () => {
    const m1 = cand(A, 300_000, 0.9);
    const cheap = cand(A, 200_000, 0.4, { title: "PikoStep Canvas" });
    const m2 = cand(A, 200_000, 0.5);
    for (const [language, label] of [
      ["en", "Switch Shoes to PikoStep Canvas: 400.000₫"],
      ["vi", "Đổi Giày sang PikoStep Canvas: 400.000₫"],
    ] as const) {
      const input = world(
        [item("m1", { needLabel: language === "en" ? "Shoes" : "Giày" }), item("m2")],
        450_000,
        { m1: [m1, cheap], m2: [m2] },
        language,
      );
      const picks = { m1, m2 };
      const fits = fitToBudget(input, { picks });
      checkAll(input, picks, fits);
      expect(fits[0]).toMatchObject({
        removeItemKeys: [],
        swaps: [{ itemKey: "m1", productId: cheap.product.id }],
        fits: true,
        dropsMustHave: false,
      });
      expect(fits[0].label).toBe(label);
    }
  });

  it("combined drop + swap label, en and vi", () => {
    const other = cand(A, 730_000, 0.5);
    const shoes = cand(A, 400_000, 0.9);
    const piko = cand(A, 250_000, 0.5, { title: "PikoStep Canvas" });
    const lunch = cand(A, 100_000, 0.5);
    for (const [language, labels, label] of [
      ["en", ["Shoes", "Lunch box"], "Drop Lunch box and switch Shoes to PikoStep Canvas: 980.000₫"],
      ["vi", ["Giày", "Hộp cơm"], "Bỏ Hộp cơm, đổi Giày sang PikoStep Canvas: 980.000₫"],
    ] as const) {
      const input = world(
        [
          item("other"),
          item("shoes", { needLabel: labels[0] }),
          item("lunch", { required: false, needLabel: labels[1] }),
        ],
        1_000_000,
        { other: [other], shoes: [shoes, piko], lunch: [lunch] },
        language,
      );
      const picks = { other, shoes, lunch };
      const fits = fitToBudget(input, { picks });
      checkAll(input, picks, fits);
      expect(fits[0]).toMatchObject({
        removeItemKeys: ["lunch"],
        grandTotal: 980_000,
        fits: true,
        dropsMustHave: false,
      });
      expect(fits[0].label).toBe(label);
    }
  });

  it("drops a must-have only when nothing else fits (dropsMustHave: true)", () => {
    const m1 = cand(A, 300_000, 0.5);
    const m2 = cand(A, 250_000, 0.9);
    const input = world([item("m1", { needLabel: "Shoes" }), item("m2")], 400_000, { m1: [m1], m2: [m2] });
    const picks = { m1, m2 };
    const fits = fitToBudget(input, { picks });
    checkAll(input, picks, fits);
    expect(fits).toHaveLength(1);
    // lowest score per ₫ goes first: m1 (0.5 / 300k) < m2 (0.9 / 250k)
    expect(fits[0]).toMatchObject({ removeItemKeys: ["m1"], fits: true, dropsMustHave: true, grandTotal: 250_000 });
    expect(fits[0].label).toBe("Drop Shoes: 250.000₫");
  });

  it("when the non-must-have moves are not enough: a best-effort suggestion, then one that drops a must-have", () => {
    const w = cand(A, 190_000, 0.9);
    const wCheap = cand(A, 90_000, 0.5, { title: "Minh An Kids Water Bottle 500 ml" });
    const l = cand(A, 99_000, 0.5);
    const n = cand(A, 25_000, 0.5);
    const input = world(
      [item("w", { needLabel: "Water bottle" }), item("l", { needLabel: "Lunch box", required: false }), item("n")],
      100_000,
      { w: [w, wCheap], l: [l], n: [n] },
    );
    const picks = { w, l, n };
    const fits = fitToBudget(input, { picks });
    checkAll(input, picks, fits);
    expect(fits).toHaveLength(2);
    expect(fits[0]).toMatchObject({
      removeItemKeys: ["l"],
      swaps: [{ itemKey: "w", productId: wCheap.product.id }],
      fits: false,
      dropsMustHave: false,
    });
    expect(fits[0].label).toBe("Drop Lunch box and switch Water bottle to Minh An Kids Water Bottle 500 ml: 115.000₫");
    expect(fits[1]).toMatchObject({ fits: true, dropsMustHave: true });
    expect(fits[1].grandTotal).toBeLessThanOrEqual(100_000);
  });

  it("grandTotal is the exact re-priced basket (shipping, FREESHIP, vouchers) for every suggestion", () => {
    const X = shop("x", 30_000);
    const Y = shop("y", 20_000);
    const m1 = cand(X, 250_000, 0.9);
    const m1b = cand(Y, 120_000, 0.5);
    const m2 = cand(X, 100_000, 0.5);
    const n = cand(Y, 80_000, 0.3);
    const input: OptimizerInput = {
      plan: plan([item("m1"), item("m2"), item("n", { required: false })], 300_000),
      candidates: { m1: [m1, m1b], m2: [m2], n: [n] },
      shops: [X, Y],
      vouchers: [
        freeship(),
        voucher({ code: "X20", scope: "shop", shopId: "x", kind: "fixed", value: 20_000, minSpend: 300_000 }),
      ],
      today: TODAY,
    };
    const picks = { m1, m2, n };
    const fits = fitToBudget(input, { picks });
    expect(fits.length).toBeGreaterThan(0);
    checkAll(input, picks, fits);
  });
});
