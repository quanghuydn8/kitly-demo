// Kitly screen components from fixtures (T11 Full): chat column, kit panel, history sidebar.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import kitSample from "@/contract/fixtures/kit.sample.json";
import { KitStreamSchema, ThreadsSampleSchema, type BasketOption, type KitVersion } from "@/contract";
import { ChatColumn } from "@/components/kit/ChatColumn";
import { KitPanel } from "@/components/kit/KitPanel";
import { HistorySidebar } from "@/components/kit/HistorySidebar";
import { applyEvent, startRun } from "@/lib/client/kit-run";

afterEach(cleanup);

const [hero, puppy] = ThreadsSampleSchema.parse(threadsJson);
const noop = () => {};

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

/** The hero v1 with its Balanced option's noMatch rows replaced. */
function withNoMatch(rows: BasketOption["noMatch"], language: "en" | "vi" = "en"): KitVersion {
  const v = hero.versions[0];
  return {
    ...v,
    plan: { ...v.plan, language },
    options: v.options.map((o) => (o.profile === "balanced" ? { ...o, noMatch: rows } : o)),
  };
}

const heroNoMatch = hero.versions[0].options.find((o) => o.profile === "balanced")!.noMatch[0];

describe("ChatColumn", () => {
  it("a thread with 2 versions renders 2 user bubbles, the explanation and assumption chips", () => {
    chat(hero.versions);
    const bubbles = screen.getAllByTestId("user-bubble");
    expect(bubbles.map((b) => b.textContent)).toEqual([hero.versions[0].userText, hero.versions[1].userText]);
    expect(screen.getByText(/Removed the uniform and set the budget/)).toBeTruthy();
    expect(screen.getAllByText("By Sep 5 (school opening)").length).toBeGreaterThan(0);
  });

  it("an awaiting_budget version renders the question with 4 choice buttons; a click sends the budget", () => {
    const onChooseBudget = vi.fn();
    chat(puppy.versions, { onChooseBudget });
    expect(screen.getByText("What's your budget?")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Budget choices" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["500.000 ₫", "1.000.000 ₫", "2.000.000 ₫", "No limit"]);
    fireEvent.click(buttons[3]);
    expect(onChooseBudget).toHaveBeenCalledWith(null);
  });

  it("adjust versions render as a system line, not a user bubble", () => {
    const adjust: KitVersion = { ...hero.versions[1], version: 3, kind: "adjust", userText: "Removed: Lunch box" };
    chat([...hero.versions, adjust]);
    expect(screen.getByText("⚙ Removed: Lunch box")).toBeTruthy();
    expect(screen.getAllByTestId("user-bubble")).toHaveLength(2);
  });

  it("a live run shows the timeline while streaming, then collapses to the summary line", () => {
    const events = KitStreamSchema.parse(kitSample);
    const mid = events.slice(
      0,
      events.findIndex((e) => e.event === "options"),
    );
    let run = mid.reduce(applyEvent, startRun({ kind: "new", query: "Grade 1 kit" }));
    const { rerender } = chat([], { run, busy: true });
    expect(screen.getByTestId("user-bubble").textContent).toBe("Grade 1 kit");
    expect(screen.getByText("Compared 24 products from 4 shops")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true);

    run = events.reduce(applyEvent, startRun({ kind: "new", query: "Grade 1 kit" }));
    rerender(
      <ChatColumn
        versions={[]}
        run={run}
        summaries={{}}
        busy={false}
        onSend={noop}
        onChooseBudget={noop}
        onRetry={noop}
      />,
    );
    expect(screen.getByText("Planned 10 items · compared 24 products from 4 shops")).toBeTruthy();
    expect(screen.getByText(/Back-to-school 10% is applied\./)).toBeTruthy();
  });

  it("an error event shows inline with Retry", () => {
    const onRetry = vi.fn();
    const run = applyEvent(startRun({ kind: "new", query: "x" }), {
      event: "error",
      data: { code: "llm_timeout", message: "The planner timed out" },
    });
    chat([], { run, onRetry });
    expect(screen.getByRole("alert").textContent).toMatch(/The planner timed out/);
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("on a new kit, example chips send their sentence", () => {
    const onSend = vi.fn();
    chat([], { onSend });
    const chips = screen.getByRole("group", { name: "Examples" });
    expect(within(chips).getAllByRole("button")).toHaveLength(6);
    fireEvent.click(within(chips).getAllByRole("button")[0]);
    expect(onSend).toHaveBeenCalledWith(expect.stringMatching(/Grade 1/));
  });
});

describe("KitPanel", () => {
  it("shows the version switcher (Version 2 of 2) and defaults to the Balanced tab", () => {
    panel(hero.versions);
    const switcher = screen.getByRole("combobox", { name: "Version" }) as HTMLSelectElement;
    expect([...switcher.options].map((o) => o.textContent)).toEqual(["Version 1 of 2", "Version 2 of 2"]);
    expect(switcher.value).toBe("2");
    const selected = screen.getByRole("tab", { selected: true });
    expect(selected.textContent).toMatch(/^Balanced · .* · best value/);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("header shows event, budget and deadline", () => {
    panel(hero.versions);
    expect(screen.getByText("Back to school")).toBeTruthy();
    expect(screen.getByText("Budget 1.000.000 ₫")).toBeTruthy();
    expect(screen.getByText("By Sep 5")).toBeTruthy();
  });

  it("an older version is read-only with Restore this version", () => {
    const onRestore = vi.fn();
    panel(hero.versions, { viewVersion: 1, onRestore });
    expect(screen.queryByRole("button", { name: "Swap" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it("Swap posts the alternative for the selected profile", () => {
    const onSwap = vi.fn();
    panel(hero.versions, { onSwap });
    fireEvent.click(screen.getAllByRole("button", { name: /alternative/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Swap" })[0]);
    expect(onSwap).toHaveBeenCalledWith(2, "balanced", expect.any(String), expect.any(String));
  });

  it("a noMatch row with closest shows the honest sentence, the closest product and Missing: anti-hunchback", () => {
    panel([withNoMatch([heroNoMatch])]);
    expect(screen.getByText("No exact match: no anti-hunchback backpack under 400k")).toBeTruthy();
    expect(screen.getByText("Minh An Kids Backpack New Model 2026")).toBeTruthy();
    expect(screen.getByText("Missing: anti-hunchback")).toBeTruthy();
  });

  it("with plan.language = vi the noMatch sentence is Vietnamese", () => {
    panel([withNoMatch([{ ...heroNoMatch, needLabel: "Balo chống gù" }], "vi")]);
    expect(screen.getByText("Chưa có balo chống gù dưới 400.000 ₫")).toBeTruthy();
  });

  it("a noMatch row without closest lands in Not in store yet", () => {
    panel([
      withNoMatch([heroNoMatch, { itemKey: "dog-food", needLabel: "Dog food", reason: "no_category", closest: null }]),
    ]);
    const block = screen.getByRole("region", { name: /Not in store yet \(1\)/ });
    expect(within(block).getByText("Dog food")).toBeTruthy();
    expect(screen.getAllByText(/No exact match/)).toHaveLength(1);
  });

  it("awaiting_budget shows Waiting for your budget", () => {
    panel(puppy.versions);
    expect(screen.getByText("Waiting for your budget")).toBeTruthy();
    expect(screen.getByText("Budget not set yet")).toBeTruthy();
  });

  it("totals, savings, over-budget banner, Add kit to cart; no seller links", () => {
    const onAddToCart = vi.fn();
    const v = hero.versions[0];
    const balanced = v.options.find((o) => o.profile === "balanced")!;
    const over: BasketOption = {
      ...balanced,
      status: "over_budget",
      overBy: 187_000,
      minimumCost: 290_000,
      costDrivers: ["Water bottle", "Lunch box"],
    };
    const { container } = panel([{ ...v, options: v.options.map((o) => (o.profile === "balanced" ? over : o)) }], {
      onAddToCart,
    });
    expect(screen.getByText(/Your wallet voucher Back-to-school 10%/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(
      /Over budget by 187\.000 ₫.*290\.000 ₫.*Water bottle, Lunch box/,
    );
    expect(screen.getByRole("tab", { selected: true }).textContent).toMatch(/⚠/);
    fireEvent.click(screen.getByRole("button", { name: /Add kit to cart/ }));
    expect(onAddToCart).toHaveBeenCalledWith(over);
    expect(container.querySelector('a[href^="/seller"]')).toBeNull();
  });
});

describe("HistorySidebar", () => {
  it("lists threads with relative dates, highlights the active one, links + New kit", () => {
    render(
      <HistorySidebar
        threads={[hero.thread, puppy.thread]}
        activeId={hero.thread.id}
        nowIso="2026-09-02T10:10:40.000Z"
      />,
    );
    expect(screen.getByRole("link", { name: /New kit/ }).getAttribute("href")).toBe("/kit/new");
    const active = screen.getByRole("link", { current: "page" });
    expect(active.getAttribute("href")).toBe(`/kit/t/${hero.thread.id}`);
    expect(active.textContent).toMatch(/5 min ago/);
    expect(screen.getByText("I'm adopting a puppy")).toBeTruthy();
  });
});
