// Saver / Balanced / Premium tabs (T11 + 20b helper): meaning + total, identical baskets merged, default Balanced.
import { describe, expect, it } from "vitest";
import kitSample from "@/contract/fixtures/kit.sample.json";
import { KitStreamSchema, type BasketOption } from "@/contract";
import { basketTabs, defaultTabId, differenceLine } from "@/lib/client/kit-compare";

const events = KitStreamSchema.parse(kitSample);
const options = events.flatMap((e) => (e.event === "options" ? e.data.options : []));
const [saver, balanced, premium] = options;

describe("basketTabs", () => {
  it("one tab per distinct basket, in Saver / Balanced / Premium order, with meaning and total", () => {
    const tabs = basketTabs(options);
    expect(tabs.map((t) => t.label)).toEqual([
      "Saver · 755.700 ₫ · lowest total",
      "Balanced · 820.000 ₫ · best value",
      "Premium · 1.359.000 ₫ · top-rated within budget",
    ]);
    expect(defaultTabId(tabs)).toBe(tabs[1].id);
  });

  it("merges identical baskets (same total and same product/quantity set) into one tab", () => {
    const sameAsBalanced: BasketOption = { ...balanced, profile: "saver", lines: [...balanced.lines].reverse() };
    const two = basketTabs([sameAsBalanced, balanced, premium]);
    expect(two).toHaveLength(2);
    expect(two[0].label).toBe("Saver = Balanced · 820.000 ₫ · best value");
    expect(defaultTabId(two)).toBe(two[0].id);

    const all = basketTabs([sameAsBalanced, balanced, { ...balanced, profile: "premium" }]);
    expect(all.map((t) => t.label)).toEqual(["Saver = Balanced = Premium · 820.000 ₫ · best value"]);
  });

  it("flags over-budget tabs and returns no tabs when every option is empty", () => {
    const over: BasketOption = { ...premium, status: "over_budget" };
    expect(basketTabs([saver, balanced, over]).map((t) => t.overBudget)).toEqual([false, false, true]);
    expect(basketTabs(options.map((o) => ({ ...o, lines: [] })))).toEqual([]);
  });

  it("defaults to the first tab when there is no Balanced option", () => {
    const tabs = basketTabs([saver, premium]);
    expect(defaultTabId(tabs)).toBe(tabs[0].id);
  });
});

describe("differenceLine (20b)", () => {
  const label = (key: string) =>
    ({ notebooks: "Notebooks", pencils: "Pencils & pens", uniform: "Uniform shirt", shoes: "School shoes", "lunch-box": "Lunch box",
       "pencil-case": "Pencil case", crayons: "Crayons", "water-bottle": "Water bottle" })[key] ?? key;

  it("Saver vs Balanced: signed total difference and the items whose product differs", () => {
    expect(differenceLine(saver, balanced, label)).toBe("−64.300 ₫, cheaper notebooks, pencils & pens and uniform shirt");
  });

  it("Premium vs Balanced: names at most 3 items, then 'N more'", () => {
    expect(differenceLine(premium, balanced, label)).toBe(
      "+539.000 ₫, higher-rated pencil case, crayons, water bottle and 2 more",
    );
  });

  it("one or two differing items read naturally; identical or Balanced itself ⇒ null", () => {
    const one: BasketOption = {
      ...balanced,
      profile: "saver",
      grandTotal: balanced.grandTotal - 26000,
      lines: balanced.lines.map((l) => (l.itemKey === "pencils" ? { ...l, product: { ...l.product, id: "cheap-pens" } } : l)),
    };
    expect(differenceLine(one, balanced, label)).toBe("−26.000 ₫, cheaper pencils & pens");
    expect(differenceLine(balanced, balanced, label)).toBeNull();
    expect(differenceLine({ ...balanced, profile: "premium" }, balanced, label)).toBeNull();
  });

  it("same total but other products says so; a missing item counts as a difference", () => {
    const swapped: BasketOption = {
      ...balanced,
      profile: "premium",
      lines: balanced.lines.filter((l) => l.itemKey !== "shoes"),
    };
    expect(differenceLine(swapped, balanced, label)).toBe("same total, higher-rated school shoes");
  });
});
