// Seams (T20b): the pure comparison model behind the three-basket view (src/lib/client/kit-compare.ts), the
// ThreeBaskets component rendered to HTML from contract payloads, and the Kitly request bodies (kit-source.ts).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { kitSample } from "@/contract/fixtures";
import { KitRequestSchema, RefineRequestSchema } from "@/contract/schemas";
import type { BasketOption, KitPlan } from "@/contract/types";
import { ThreeBaskets } from "@/components/kit/ThreeBaskets";
import { swapAlternative } from "@/lib/client/kit-basket";
import { compareBaskets, KIT_PROFILES } from "@/lib/client/kit-compare";
import { kitRequest, refineRequest } from "@/lib/client/kit-source";

const optionsEv = kitSample.find((e) => e.event === "options")!;
const planEv = kitSample.find((e) => e.event === "plan")!;
if (optionsEv.event !== "options" || planEv.event !== "plan") throw new Error("fixture");
const plan: KitPlan = planEv.data.plan;
const sample: BasketOption = optionsEv.data.options[0];

// Three real-shaped options: saver swaps notebooks and drops crayons, premium swaps the uniform.
const balanced: BasketOption = { ...sample, profile: "balanced", grandTotal: 1_000_000 };
const saverBase = swapAlternative(balanced, "notebooks", 0);
const saver: BasketOption = {
  ...saverBase,
  profile: "saver",
  lines: saverBase.lines.filter((l) => l.itemKey !== "crayons"),
  skipped: [{ itemKey: "crayons", needLabel: "Crayons", reason: "budget" }],
  grandTotal: 790_000,
};
const premium: BasketOption = { ...swapAlternative(balanced, "uniform", 0), profile: "premium", grandTotal: 1_420_000 };

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("compareBaskets", () => {
  // Server order is not trusted: columns always read Saver / Balanced / Premium.
  const cmp = compareBaskets([premium, balanced, saver], plan);

  it("orders columns saver, balanced, premium with their totals", () => {
    expect(cmp.columns.map((c) => c.profile)).toEqual(["saver", "balanced", "premium"]);
    expect(cmp.columns.map((c) => c.label)).toEqual(["Saver", "Balanced", "Premium"]);
    expect(cmp.columns.map((c) => c.option.grandTotal)).toEqual([790_000, 1_000_000, 1_420_000]);
  });

  it("gives each column its price difference against Balanced", () => {
    expect(cmp.columns.map((c) => c.deltaVsBalanced)).toEqual([-210_000, 0, 420_000]);
  });

  it("scores each basket as the mean product rating, shown in half stars", () => {
    const ratings = balanced.lines.map((l) => l.product.rating);
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const col = cmp.columns[1];
    expect(col.rating).toBeCloseTo(mean, 5);
    expect(col.stars).toBe(Math.round(mean * 2) / 2);
    expect(compareBaskets([{ ...balanced, lines: [] }], plan).columns[0].rating).toBeNull();
  });

  it("builds one row per plan item in plan order, one cell per profile", () => {
    expect(cmp.rows.map((r) => r.itemKey)).toEqual(plan.items.map((i) => i.key));
    expect(cmp.rows.every((r) => r.cells.length === 3)).toBe(true);
  });

  it("flags rows where the profiles disagree and leaves identical rows plain", () => {
    const byKey = Object.fromEntries(cmp.rows.map((r) => [r.itemKey, r]));
    expect(byKey.notebooks.differs).toBe(true);
    expect(byKey.uniform.differs).toBe(true);
    expect(byKey.crayons.differs).toBe(true);
    expect(byKey.crayons.cells.map((c) => c.kind)).toEqual(["skipped", "line", "line"]);
    expect(byKey.pencils.differs).toBe(false);
    expect(byKey.backpack.differs).toBe(false);
    expect(byKey.backpack.cells.every((c) => c.kind === "gap")).toBe(true);
  });

  it("works with a single option (no Balanced → no delta)", () => {
    const one = compareBaskets([saver], plan);
    expect(one.columns).toHaveLength(1);
    expect(one.columns[0].deltaVsBalanced).toBeNull();
    expect(one.rows.every((r) => !r.differs)).toBe(true);
  });
});

describe("ThreeBaskets", () => {
  const html = renderToStaticMarkup(
    createElement(ThreeBaskets, {
      options: [premium, balanced, saver],
      plan,
      selected: "balanced",
      onSelect: () => {},
      onChoose: () => {},
    }),
  );
  const t = text(html);

  it("renders three desktop columns with totals and a Choose this kit button each", () => {
    for (const p of KIT_PROFILES) {
      expect(html).toContain(`data-testid="basket-col-${p}"`);
      expect(html).toContain(`data-testid="choose-${p}"`);
    }
    expect(t).toContain("790.000₫");
    expect(t).toContain("1.420.000₫");
    expect(t.match(/Choose this kit/g)!.length).toBe(3);
  });

  it("shows score stars and the difference against Balanced", () => {
    expect(html).toContain('aria-label="Score');
    expect(t).toContain("-210.000₫ vs Balanced");
    expect(t).toContain("+420.000₫ vs Balanced");
  });

  it("highlights the cells that differ between baskets", () => {
    expect(html).toContain('data-testid="cell-saver-notebooks" data-differs="true"');
    expect(html).toContain('data-testid="cell-balanced-pencils" data-differs="false"');
    expect(t).toContain("Skipped for budget");
  });

  it("has mobile tabs for the three profiles with the selected one marked", () => {
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)!.length).toBe(3);
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Balanced/);
  });

  it("marks an over-budget basket", () => {
    const over = renderToStaticMarkup(
      createElement(ThreeBaskets, {
        options: [saver, balanced, { ...premium, status: "over_budget" as const }],
        plan,
        selected: "balanced",
        onSelect: () => {},
        onChoose: () => {},
      }),
    );
    expect(text(over)).toContain("Over budget");
  });
});

describe("Kitly request bodies", () => {
  it("asks for all three profiles on a new kit", () => {
    const body = kitRequest("Grade 1 kit");
    expect(body).toEqual({ query: "Grade 1 kit", profiles: ["saver", "balanced", "premium"] });
    expect(KitRequestSchema.parse(body)).toEqual(body);
  });

  it("asks for all three profiles on refine", () => {
    const body = refineRequest("s1", plan, "budget 1M now");
    expect(body.profiles).toEqual(["saver", "balanced", "premium"]);
    expect(RefineRequestSchema.parse(body)).toEqual(body);
  });
});

describe("F8: merged identical baskets", () => {
  const same = (profile: BasketOption["profile"]): BasketOption => ({ ...balanced, profile });

  it("merges baskets with the same lines and total into one column labelled 'Saver = Balanced'", () => {
    const cmp = compareBaskets([same("saver"), balanced, premium], plan);
    expect(cmp.columns.map((c) => c.label)).toEqual(["Saver = Balanced", "Premium"]);
    expect(cmp.columns[0].profiles).toEqual(["saver", "balanced"]);
    expect(cmp.columns[0].profile).toBe("balanced"); // Balanced represents the group
    expect(cmp.rows.every((r) => r.cells.length === 2)).toBe(true);
  });

  it("merges all three", () => {
    const cmp = compareBaskets([same("saver"), balanced, same("premium")], plan);
    expect(cmp.columns.map((c) => c.label)).toEqual(["Saver = Balanced = Premium"]);
  });

  it("does not merge when the totals differ even if lines match", () => {
    const cmp = compareBaskets([{ ...same("saver"), grandTotal: 1 }, balanced], plan);
    expect(cmp.columns).toHaveLength(2);
  });

  it("does not merge when quantities differ", () => {
    const lines = balanced.lines.map((l, i) => (i === 0 ? { ...l, quantity: l.quantity + 1 } : l));
    expect(compareBaskets([{ ...same("saver"), lines }, balanced], plan).columns).toHaveLength(2);
  });

  it("renders one column with the merged label and marks it selected when any member is selected", () => {
    const html = renderToStaticMarkup(
      createElement(ThreeBaskets, {
        options: [same("saver"), balanced, premium],
        plan,
        selected: "saver",
        onSelect: () => {},
        onChoose: () => {},
      }),
    );
    expect(text(html)).toContain("Saver = Balanced");
    expect(html.match(/data-testid="choose-/g)!.length).toBe(2);
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Saver = Balanced/);
  });

  it("two empty over-budget baskets are not merged away into nonsense: zero-line options never merge with lined ones", () => {
    const empty = { ...balanced, lines: [], grandTotal: 0 };
    expect(compareBaskets([{ ...empty, profile: "saver" }, balanced], plan).columns).toHaveLength(2);
  });
});

describe("F8: over-budget basket cannot be chosen", () => {
  const html = renderToStaticMarkup(
    createElement(ThreeBaskets, {
      options: [saver, balanced, { ...premium, status: "over_budget" as const }],
      plan,
      selected: "balanced",
      onSelect: () => {},
      onChoose: () => {},
    }),
  );
  it("disables Choose this kit for over_budget with a reason, others stay enabled", () => {
    expect(html).toMatch(/data-testid="choose-premium"[^>]*disabled=""/);
    expect(html).not.toMatch(/data-testid="choose-balanced"[^>]*disabled=""/);
    expect(text(html)).toContain("Over budget — pick another kit or raise your budget");
  });
});
