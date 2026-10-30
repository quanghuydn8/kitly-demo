// Three baskets UI (ticket 20b): difference line vs Balanced under the tabs, default Balanced, merged identical
// baskets, no tabs when every option is empty, over-budget tabs keep ⚠ + warning and stay usable (D29).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import { ThreadsSampleSchema, type BasketOption, type KitVersion } from "@/contract";
import { KitPanel } from "@/components/kit/KitPanel";
import { differenceLine } from "@/lib/client/kit-compare";

afterEach(cleanup);

const [hero] = ThreadsSampleSchema.parse(threadsJson);
const v1 = hero.versions[0];
const opt = (p: BasketOption["profile"]) => v1.options.find((o) => o.profile === p)!;
const label = (k: string) => v1.plan.items.find((i) => i.key === k)?.needLabel ?? k;
const noop = () => {};

function panel(version: KitVersion, extra: Partial<Parameters<typeof KitPanel>[0]> = {}) {
  return render(
    <KitPanel
      versions={[version]}
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

const diff = () => screen.queryByTestId("basket-diff");

describe("three baskets (20b)", () => {
  it("defaults to Balanced with no difference line; Saver / Premium show their line vs Balanced", () => {
    panel(v1);
    expect(screen.getByRole("tab", { selected: true }).textContent).toMatch(/^Balanced · .* · best value/);
    expect(diff()).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /^Saver/ }));
    const saverLine = differenceLine(opt("saver"), opt("balanced"), label)!;
    expect(saverLine).toMatch(/^−[\d.]+ ₫, cheaper /);
    expect(diff()!.textContent).toBe(`vs Balanced: ${saverLine}`);

    fireEvent.click(screen.getByRole("tab", { name: /^Premium/ }));
    expect(diff()!.textContent).toMatch(/^vs Balanced: \+[\d.]+ ₫, higher-rated /);
  });

  it("identical Saver and Balanced merge into one selected tab 'Saver = Balanced' without a difference line", () => {
    panel({ ...v1, options: v1.options.map((o) => (o.profile === "saver" ? { ...opt("balanced"), profile: "saver" } : o)) });
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toMatch(/^Saver = Balanced · .* · best value/);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(diff()).toBeNull();
  });

  it("no tabs when every option is empty: the single honest-gap view", () => {
    panel({ ...v1, options: v1.options.map((o) => ({ ...o, lines: [] })) });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(diff()).toBeNull();
    expect(screen.getByText(/No exact matches yet\. Add a closest product anyway/)).toBeTruthy();
    expect(screen.queryByText("Grand total")).toBeNull();
  });

  it("an over-budget Premium tab keeps ⚠, shows the warning and can still be added to cart", () => {
    const over: BasketOption = { ...opt("premium"), status: "over_budget", overBy: 59_000 };
    const onAddToCart = vi.fn();
    panel({ ...v1, options: v1.options.map((o) => (o.profile === "premium" ? over : o)) }, { onAddToCart });
    const premiumTab = screen.getByRole("tab", { name: /^Premium/ }) as HTMLButtonElement;
    expect(premiumTab.textContent).toMatch(/⚠/);
    expect(premiumTab.disabled).toBe(false);
    fireEvent.click(premiumTab);
    expect(screen.getByRole("alert").textContent).toMatch(/Over budget by 59\.000 ₫/);
    expect(diff()).not.toBeNull();
    const add = screen.getByRole("button", { name: /Add kit to cart/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(onAddToCart).toHaveBeenCalledWith(over);
  });
});
