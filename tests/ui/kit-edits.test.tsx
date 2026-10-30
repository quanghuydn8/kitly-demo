// Kit edits UI (T15 Full): ✕ remove + Undo, Add anyway, over budget + Fit to budget, inline budget/deadline,
// editable assumption chips. Component seams (KitPanel, ChatColumn) on fixtures + the pure selection helpers.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import overBudgetJson from "@/contract/fixtures/option.over-budget.json";
import { BasketOptionSchema, ThreadsSampleSchema, type BasketOption, type KitVersion } from "@/contract";
import { ChatColumn } from "@/components/kit/ChatColumn";
import { KitPanel } from "@/components/kit/KitPanel";
import {
  assumptionCorrection,
  closestMatchLabel,
  parseBudgetInput,
  undoableRemoval,
  withFit,
  withoutPick,
  withPick,
} from "@/lib/client/kit-edits";

afterEach(cleanup);

const [hero] = ThreadsSampleSchema.parse(threadsJson);
const overBudget = BasketOptionSchema.parse(overBudgetJson);
const noop = () => {};
const v2 = hero.versions[1];
const balanced = v2.options.find((o) => o.profile === "balanced")!;
const backpackRow = balanced.noMatch[0];

function panel(versions: KitVersion[], extra: Partial<Parameters<typeof KitPanel>[0]> = {}) {
  return render(
    <KitPanel
      versions={versions}
      viewVersion={null}
      onViewVersion={noop}
      onRestore={noop}
      overrides={{}}
      onSwap={noop}
      onAddToCart={noop}
      {...extra}
    />,
  );
}

function chat(versions: KitVersion[], extra: Partial<Parameters<typeof ChatColumn>[0]> = {}) {
  return render(
    <ChatColumn
      versions={versions}
      run={null}
      summaries={{}}
      busy={false}
      onSend={noop}
      onChooseBudget={noop}
      onRetry={noop}
      {...extra}
    />,
  );
}

/** v3 = "Removed: Water bottle" adjust on top of the hero thread. */
const removed: KitVersion = {
  ...v2,
  version: 3,
  kind: "adjust",
  userText: "Removed: Water bottle",
  excludedKeys: ["water-bottle"],
  diff: { added: [], removed: ["water-bottle"], changed: [] },
  selection: null,
};

/** The hero v2 with an over-budget Balanced option (the fixture, budget 200k). */
const overVersion: KitVersion = {
  ...v2,
  plan: { ...v2.plan, budget: 200_000 },
  options: v2.options.map((o) => (o.profile === "balanced" ? overBudget : o)),
};

describe("✕ remove item (D33)", () => {
  it("each basket row has a ✕ that removes the item", () => {
    const onRemoveItem = vi.fn();
    panel(hero.versions, { onRemoveItem });
    const basket = screen.getByRole("list", { name: "Basket" });
    expect(within(basket).getAllByRole("button", { name: /I already have this/ })).toHaveLength(balanced.lines.length);
    fireEvent.click(screen.getByRole("button", { name: "Remove Water bottle (I already have this)" }));
    expect(onRemoveItem).toHaveBeenCalledWith("water-bottle");
  });

  it("the remove adjust shows in the chat as a system line with Undo → restore_item", () => {
    const onRestoreItem = vi.fn();
    chat([...hero.versions, removed], { onRestoreItem });
    const line = screen.getByText(/⚙ Removed: Water bottle/).closest("li")!;
    expect(line.textContent).toBe("⚙ Removed: Water bottle · Undo");
    fireEvent.click(within(line).getByRole("button", { name: "Undo" }));
    expect(onRestoreItem).toHaveBeenCalledWith("water-bottle");
  });

  it("no Undo once the item is back, and none on other adjust lines", () => {
    const restored: KitVersion = { ...removed, version: 4, userText: "Restored: Water bottle", excludedKeys: [], diff: { added: ["water-bottle"], removed: [], changed: [] } };
    const budget: KitVersion = { ...removed, version: 5, userText: "Budget: 900.000 ₫", excludedKeys: [], diff: { added: [], removed: [], changed: [] } };
    chat([...hero.versions, removed, restored, budget], { onRestoreItem: noop });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByText("⚙ Restored: Water bottle")).toBeTruthy();
  });

  it("undoableRemoval: the item key of a remove adjust, only while the latest version still excludes it", () => {
    expect(undoableRemoval(removed, removed)).toBe("water-bottle");
    expect(undoableRemoval(removed, { ...removed, version: 4, excludedKeys: [] })).toBeNull();
    expect(undoableRemoval(v2, removed)).toBeNull();
  });
});

describe("Add anyway (D28)", () => {
  it("the closest product of a No exact match row has Add anyway → picks it for the shown profile", () => {
    const onAddAnyway = vi.fn();
    panel(hero.versions, { onAddAnyway });
    fireEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    expect(onAddAnyway).toHaveBeenCalledWith(2, "balanced", "backpack", "prod-minhan-backpack");
  });

  it("once priced, the closest product is a basket line labelled Closest match · missing …, ✕ takes it out", () => {
    const c = backpackRow.closest!;
    const repriced: BasketOption = {
      ...balanced,
      noMatch: [],
      lines: [
        { itemKey: "backpack", product: c.candidate.product, shop: c.candidate.shop, quantity: 1, lineTotal: c.candidate.product.price, reason: "Added anyway, missing: anti-hunchback", alternatives: [] },
        ...balanced.lines,
      ],
    };
    const onTakeOut = vi.fn();
    const onRemoveItem = vi.fn();
    panel(hero.versions, { overrides: { "2:balanced": repriced }, onTakeOut, onRemoveItem });
    expect(screen.queryByRole("list", { name: "No exact match" })).toBeNull();
    const row = screen.getByText("Closest match · missing anti-hunchback").closest("li")!;
    expect(within(row).getByText(c.candidate.product.title)).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: /Take out/ }));
    expect(onTakeOut).toHaveBeenCalledWith(2, "balanced", "backpack");
    expect(onRemoveItem).not.toHaveBeenCalled();
  });

  it("closestMatchLabel only labels a line holding the base option's closest product", () => {
    const c = backpackRow.closest!;
    const line = { ...balanced.lines[0], itemKey: "backpack", product: c.candidate.product };
    expect(closestMatchLabel(balanced, line)).toBe("Closest match · missing anti-hunchback");
    expect(closestMatchLabel(balanced, balanced.lines[0])).toBeNull();
  });
});

describe("Over budget + Fit to budget (D29)", () => {
  it("shows the red banner, both fit buttons (must-have tag) and an enabled Add to cart with the over-budget text", () => {
    const onAddToCart = vi.fn();
    panel([overVersion], { onAddToCart });
    expect(screen.getByRole("alert").textContent).toMatch(/^Over budget by 187\.000 ₫/);
    const fits = within(screen.getByRole("group", { name: "Fit to budget" })).getAllByRole("button");
    expect(fits).toHaveLength(2);
    expect(fits[0].textContent).toMatch(/Drop Lunch box and switch Water bottle/);
    expect(fits[0].textContent).not.toMatch(/removes a must-have/);
    expect(fits[1].textContent).toMatch(/removes a must-have/);
    const add = screen.getByRole("button", { name: /Add kit to cart/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    expect(add.textContent).toBe("Add kit to cart (over budget by 187.000 ₫)");
    fireEvent.click(add);
    expect(onAddToCart).toHaveBeenCalledWith(overBudget);
  });

  it("a fit button sends that suggestion; Undo shows for the edited basket and restores", () => {
    const onFit = vi.fn();
    const onUndoFit = vi.fn();
    const { rerender } = panel([overVersion], { onFit, onUndoFit });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "Fit to budget" })).getAllByRole("button")[1]);
    expect(onFit).toHaveBeenCalledWith(2, "balanced", overBudget.fit![1]);
    rerender(
      <KitPanel versions={[overVersion]} viewVersion={null} onViewVersion={noop} onRestore={noop} overrides={{}} onSwap={noop} onAddToCart={noop} onFit={onFit} onUndoFit={onUndoFit} fitUndoKey="2:balanced" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndoFit).toHaveBeenCalled();
  });

  it("withFit adds the removals and swaps to the profile's selection; withPick/withoutPick edit picks", () => {
    const fit = overBudget.fit![0];
    expect(withFit(null, "balanced", fit)).toEqual({ profile: "balanced", picks: { "water-bottle": "prod-minhan-bottle" }, dropped: ["lunch-box"] });
    const base = { profile: "balanced" as const, picks: { shoes: "p-1" }, dropped: ["lunch-box"] };
    expect(withFit(base, "balanced", fit)).toEqual({ profile: "balanced", picks: { shoes: "p-1", "water-bottle": "prod-minhan-bottle" }, dropped: ["lunch-box"] });
    // a selection made for another profile does not carry over
    expect(withPick(base, "saver", "backpack", "p-2")).toEqual({ profile: "saver", picks: { backpack: "p-2" }, dropped: [] });
    expect(withoutPick(withPick(base, "balanced", "backpack", "p-2"), "balanced", "backpack")).toEqual(base);
  });
});

describe("Inline budget / deadline edit (D32)", () => {
  it("pencil → input → Enter sends set_budget with the parsed amount", () => {
    const onSetBudget = vi.fn();
    panel(hero.versions, { onSetBudget });
    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    const input = screen.getByRole("textbox", { name: "Budget" }) as HTMLInputElement;
    expect(input.value).toBe("1.000.000");
    fireEvent.change(input, { target: { value: "1.2M" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetBudget).toHaveBeenCalledWith(1_200_000);
  });

  it("an unreadable budget is not sent and says why; Escape cancels", () => {
    const onSetBudget = vi.fn();
    panel(hero.versions, { onSetBudget });
    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    const input = screen.getByRole("textbox", { name: "Budget" });
    fireEvent.change(input, { target: { value: "lots" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetBudget).not.toHaveBeenCalled();
    expect(screen.getByText(/Type an amount/)).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Budget" })).toBeNull();
  });

  it("pencil → date → Enter sends set_deadline", () => {
    const onSetDeadline = vi.fn();
    panel(hero.versions, { onSetDeadline });
    fireEvent.click(screen.getByRole("button", { name: "Edit deadline" }));
    const input = screen.getByLabelText("Deadline") as HTMLInputElement;
    expect(input.value).toBe("2026-09-05");
    fireEvent.change(input, { target: { value: "2026-09-04" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetDeadline).toHaveBeenCalledWith("2026-09-04");
  });

  it("parseBudgetInput reads VND amounts; empty = no limit; junk = undefined", () => {
    expect(parseBudgetInput("1.500.000")).toBe(1_500_000);
    expect(parseBudgetInput("1,2tr")).toBe(1_200_000);
    expect(parseBudgetInput("800k")).toBe(800_000);
    expect(parseBudgetInput("2M")).toBe(2_000_000);
    expect(parseBudgetInput(" ")).toBeNull();
    expect(parseBudgetInput("lots")).toBeUndefined();
    expect(parseBudgetInput("0")).toBeUndefined();
  });
});

describe("Editable assumption chips", () => {
  it("click a chip → prefilled input → Enter sends the correction through the composer path", () => {
    const onSend = vi.fn();
    chat(hero.versions, { onSend });
    const chips = screen.getAllByRole("list", { name: "Assumptions" });
    fireEvent.click(within(chips[chips.length - 1]).getByRole("button", { name: "1 child" }));
    const input = screen.getByRole("textbox", { name: "Edit assumption" }) as HTMLInputElement;
    expect(input.value).toBe("1 child");
    fireEvent.change(input, { target: { value: "2 children, twins" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith('"1 child" is wrong: 2 children, twins');
    expect(assumptionCorrection("Grade 1", "Grade 2")).toBe('"Grade 1" is wrong: Grade 2');
  });

  it("after an adjust (system line) the last assistant message's chips stay editable", () => {
    chat([...hero.versions, removed]);
    const chips = screen.getAllByRole("list", { name: "Assumptions" });
    expect(within(chips[chips.length - 1]).getAllByRole("button")).toHaveLength(3);
  });

  it("chips of older versions are not editable", () => {
    chat(hero.versions);
    const chips = screen.getAllByRole("list", { name: "Assumptions" });
    expect(within(chips[0]).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("in flight", () => {
  it("busy disables ✕, Add anyway, fit buttons and the edit pencils", () => {
    panel([overVersion], { busy: true });
    for (const b of screen.getAllByRole("button", { name: /I already have this|Edit budget|Edit deadline/ })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    for (const b of within(screen.getByRole("group", { name: "Fit to budget" })).getAllByRole("button")) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    cleanup();
    panel(hero.versions, { busy: true });
    expect((screen.getByRole("button", { name: "Add anyway" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
