// Seam: Kitly result components rendered to HTML (react-dom/server) from contract fixture payloads.
// Asserts what the buyer reads: honest gaps, skipped items, over-budget banner, totals, plan, diff highlights.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { kitSample } from "@/contract/fixtures";
import type { BasketOption, KitPlan } from "@/contract/types";
import { Basket } from "@/components/kit/Basket";
import { PlanCard } from "@/components/kit/PlanCard";
import { TotalsPanel } from "@/components/kit/TotalsPanel";
import { Timeline } from "@/components/kit/Timeline";
import { initialKitState, kitReducer } from "@/lib/client/kit-state";

const optionsEv = kitSample.find((e) => e.event === "options")!;
const planEv = kitSample.find((e) => e.event === "plan")!;
if (optionsEv.event !== "options" || planEv.event !== "plan") throw new Error("fixture");
const option: BasketOption = optionsEv.data.options[0];
const plan: KitPlan = planEv.data.plan;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
const basket = (o: BasketOption, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(Basket, { option: o, plan, diff: null, ...extra }));

const overBudget: BasketOption = {
  ...option,
  status: "over_budget",
  lines: [],
  shops: [],
  itemsTotal: 0,
  shippingTotal: 0,
  discountTotal: 0,
  grandTotal: 0,
  savings: [],
  minimumCost: 712000,
  costDrivers: ["School shoes 320.000₫ (only in-time option)", "Uniform shirts ×2 258.000₫"],
};

describe("Basket", () => {
  it("renders one row per line with product, reason, quantity and line total", () => {
    const t = text(basket(option));
    expect(t).toContain("Minh An Grade 1 Notebook Pack 10 Books");
    expect(t).toContain("Grade 1 grid, best value, arrives Aug 23");
    expect(t).toContain("×2");
    expect(t).toContain("258.000₫");
  });

  it("shows a noMatch item as an honest gap, never as a product", () => {
    const html = basket(option);
    expect(text(html)).toContain("No suitable product yet: no anti-hunchback backpack under 400k");
    expect(html).toContain('data-testid="nomatch-backpack"');
    expect(html).not.toContain('data-testid="line-backpack"');
  });

  it("explains other noMatch reasons in buyer words", () => {
    const o: BasketOption = {
      ...option,
      noMatch: [
        { itemKey: "notebooks", needLabel: "Grade 1 notebooks", reason: "no_product_with_tags" },
        { itemKey: "shoes", needLabel: "School shoes", reason: "none_in_time" },
        { itemKey: "water-bottle", needLabel: "Water bottle", reason: "no_product_with_tags" },
        { itemKey: "puppy", needLabel: "Puppy bed", reason: "no_category" },
      ],
    };
    const t = text(basket(o));
    expect(t).toContain("No suitable product yet: no grade 1 notebooks matching your must-haves");
    expect(t).toContain("No suitable product yet: no school shoes arrive by Aug 25");
    expect(t).toContain("No suitable product yet: no water bottle with leak-proof");
    expect(t).toContain("No suitable product yet: puppy bed is not sold on DemoMart yet");
  });

  it("lists nice-to-haves dropped for budget under 'Skipped for budget'", () => {
    const o = {
      ...option,
      skipped: [{ itemKey: "crayons", needLabel: "Crayons", reason: "budget" as const }],
    };
    const t = text(basket(o));
    expect(t).toContain("Skipped for budget");
    expect(t).toContain("Crayons");
    expect(text(basket(option))).not.toContain("Skipped for budget");
  });

  it("offers the alternatives expander only when there are alternatives", () => {
    const html = basket(option);
    expect(text(html)).toContain("1 alternative");
    expect(html).toContain('data-testid="alts-notebooks"');
    expect(html).not.toContain('data-testid="alts-pencil-case"');
  });

  it("highlights diff chips on changed and added rows, and lists removed items", () => {
    const html = basket(option, {
      diff: { added: ["crayons"], removed: ["uniform-x"], changed: ["notebooks"] },
    });
    const t = text(html);
    expect(html).toMatch(/data-testid="line-notebooks"[^>]*data-diff="changed"/);
    expect(html).toMatch(/data-testid="line-crayons"[^>]*data-diff="added"/);
    expect(t).toContain("Removed: uniform-x");
  });
});

describe("TotalsPanel", () => {
  it("shows items, shipping, discounts, grand total vs budget, and savings lines", () => {
    const t = text(renderToStaticMarkup(createElement(TotalsPanel, { option, budget: 1_500_000 })));
    expect(t).toContain("1.080.000₫");
    expect(t).toContain("55.000₫");
    expect(t).toContain("-135.000₫");
    expect(t).toContain("1.000.000₫");
    expect(t).toContain("of 1.500.000₫ budget");
    expect(t).toContain("Buy 7 items at Minh An Stationery: free shipping + MINHAN30 voucher");
    expect(t).not.toContain("Over budget");
  });

  it("over_budget: banner with the minimum cost and the cost drivers", () => {
    const html = renderToStaticMarkup(createElement(TotalsPanel, { option: overBudget, budget: 200_000 }));
    const t = text(html);
    expect(html).toContain('data-testid="over-budget"');
    expect(t).toContain("Over budget");
    expect(t).toContain("712.000₫");
    expect(t).toContain("200.000₫");
    expect(t).toContain("School shoes 320.000₫ (only in-time option)");
    expect(t).toContain("Uniform shirts ×2 258.000₫");
  });
});

describe("PlanCard", () => {
  it("shows event, budget, deadline, assumptions and must-have / nice-to-have chips with tags", () => {
    const t = text(renderToStaticMarkup(createElement(PlanCard, { plan })));
    expect(t).toContain("Back to school");
    expect(t).toContain("1.500.000₫");
    expect(t).toContain("Aug 25");
    expect(t).toContain("Assumed 1 child starting Grade 1");
    expect(t).toContain("Anti-hunchback backpack");
    expect(t).toContain("Must-have");
    expect(t).toContain("Nice-to-have");
    expect(t).toContain("anti-hunchback");
    expect(t).toContain("max 400k");
  });
});

describe("Timeline", () => {
  it("shows the error inline with a Retry button", () => {
    let s = kitReducer(initialKitState, { type: "start" });
    s = kitReducer(s, {
      type: "event",
      event: { event: "error", data: { code: "x", message: "Planner failed" } },
    });
    const html = renderToStaticMarkup(
      createElement(Timeline, { steps: s.steps, error: s.error, onRetry: () => {} }),
    );
    expect(text(html)).toContain("Planner failed");
    expect(text(html)).toContain("Retry");
  });
});
