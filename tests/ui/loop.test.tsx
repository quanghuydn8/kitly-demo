// Close the loop (T13): "Updated for this need" on basket lines (incl. a line that replaced a previous
// "No exact match" row) and on product cards; "Back to buyer" from Seller Centre; no seller link inside Kitly (D37).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import shopsJson from "@/contract/fixtures/shops.json";
import { ThreadsSampleSchema, type BasketLine, type KitVersion, type Product } from "@/contract";
import { KitPanel } from "@/components/kit/KitPanel";
import { ChatColumn } from "@/components/kit/ChatColumn";
import { diffChips } from "@/lib/client/kit-text";
import { ProductCard } from "@/components/store/ProductCard";
import { SellerScreen } from "@/components/seller/SellerScreen";
import { LiveStrip } from "@/components/seller/LiveStrip";
import { insights } from "./seller-fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const [hero] = ThreadsSampleSchema.parse(threadsJson);
const noop = () => {};
const APPLIED = "2026-09-02T10:05:00.000Z";

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

const v2 = hero.versions[1];
const balanced = v2.options.find((o) => o.profile === "balanced")!;
const backpackRow = balanced.noMatch[0];
const closest = backpackRow.closest!.candidate;
const enriched: Product = {
  ...closest.product,
  tags: [...closest.product.tags, "anti-hunchback", "lightweight", "grade-1"],
  updatedForDemandAt: APPLIED,
};

/** v3: after the seller's fix the backpack item is a normal line holding the enriched closest product. */
const v3: KitVersion = {
  ...v2,
  version: 3,
  options: v2.options.map((o) => {
    if (o.profile !== "balanced") return o;
    const line: BasketLine = {
      itemKey: backpackRow.itemKey,
      product: enriched,
      shop: closest.shop,
      quantity: 1,
      lineTotal: enriched.price,
      reason: "Anti-hunchback, under 400k",
      alternatives: [],
    };
    return { ...o, lines: [line, ...o.lines], noMatch: o.noMatch.filter((n) => n.itemKey !== backpackRow.itemKey) };
  }),
};

const rowOf = (title: string) => screen.getByRole("link", { name: title }).closest("li")!;

describe("Updated for this need badge", () => {
  it("a basket line whose product has updatedForDemandAt carries the badge; other lines do not", () => {
    panel([hero.versions[0], v2, v3]);
    const basket = screen.getByRole("list", { name: "Basket" });
    expect(within(basket).getAllByText("Updated for this need")).toHaveLength(1);
    expect(rowOf(enriched.title).textContent).toContain("Updated for this need");
    expect(screen.queryByRole("list", { name: "No exact match" })).toBeNull();
  });

  it("the line that replaced the previous version's No exact match row is badged; the old version shows the honest row", () => {
    const { unmount } = panel([hero.versions[0], v2, v3]);
    expect(rowOf(enriched.title).textContent).toContain("Updated for this need");
    unmount();
    panel([hero.versions[0], v2, v3], { viewVersion: 2 });
    const noMatch = screen.getByRole("list", { name: "No exact match" });
    expect(noMatch.textContent).toContain("anti-hunchback");
    expect(screen.queryByText("Updated for this need")).toBeNull();
  });

  it("an alternative that was updated for the need is badged too", () => {
    const first = balanced.lines.find((l) => l.alternatives.length > 0)!;
    const alt = first.alternatives[0];
    const withAlt: KitVersion = {
      ...v2,
      options: v2.options.map((o) =>
        o.profile !== "balanced"
          ? o
          : {
              ...o,
              lines: o.lines.map((l) =>
                l.itemKey !== first.itemKey
                  ? l
                  : { ...l, alternatives: [{ ...alt, product: { ...alt.product, updatedForDemandAt: APPLIED } }, ...l.alternatives.slice(1)] },
              ),
            },
      ),
    };
    panel([hero.versions[0], withAlt]);
    expect(screen.queryByText("Updated for this need")).toBeNull();
    fireEvent.click(within(rowOf(first.product.title)).getByRole("button", { expanded: false }));
    expect(screen.getAllByText("Updated for this need")).toHaveLength(1);
  });

  it("a product card is badged only when updatedForDemandAt is set", () => {
    const { unmount } = render(<ProductCard product={{ ...closest.product, shop: closest.shop }} hasVoucher={false} />);
    expect(screen.queryByText("Updated for this need")).toBeNull();
    unmount();
    render(<ProductCard product={{ ...enriched, shop: closest.shop }} hasVoucher={false} />);
    expect(screen.getByText("Updated for this need")).toBeTruthy();
  });
});

describe("Seller Centre ↔ buyer (D37)", () => {
  it("Seller Centre has Back to buyer → /kit", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = String(url).startsWith("/api/shops") ? { shops: shopsJson } : insights();
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    render(<SellerScreen initialShopId="shop-minhan" demoToday="2026-09-02" />);
    expect(screen.getByRole("link", { name: /Back to buyer/ }).getAttribute("href")).toBe("/kit");
  });

  it("the Kitly kit panel has no seller link", () => {
    const { container } = panel([hero.versions[0], v2, v3]);
    expect(container.querySelector('a[href^="/seller"]')).toBeNull();
    expect(screen.queryByText(/Seller/)).toBeNull();
  });
});

describe("Loading / empty states (no layout shift when the basket arrives)", () => {
  it("while building, the panel shows a busy basket skeleton (header, 3 tabs, rows) in place of the kit", () => {
    panel([], { building: true });
    const sk = screen.getByRole("status", { name: "Building your kit…" });
    expect(sk.getAttribute("aria-busy")).toBe("true");
    expect(sk.querySelectorAll("[data-skeleton=tab]")).toHaveLength(3);
    expect(sk.querySelectorAll("[data-skeleton=row]").length).toBeGreaterThanOrEqual(4);
  });

  it("no kit and not building: the empty state, not the skeleton", () => {
    panel([]);
    expect(screen.getByText("Your kit will appear here.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a kit with no basket lines (every item not in store) says so instead of a 0 ₫ total", () => {
    const empty: KitVersion = {
      ...v2,
      options: v2.options.map((o) => ({
        ...o,
        lines: [],
        noMatch: o.noMatch.map((n) => ({ ...n, closest: null })),
        shops: [],
        itemsTotal: 0,
        shippingTotal: 0,
        discountTotal: 0,
        grandTotal: 0,
        savings: [],
      })),
    };
    panel([hero.versions[0], empty]);
    expect(screen.getByText("Nothing for this kit is sold here yet. Tap Notify me and sellers will see the need.")).toBeTruthy();
    expect(screen.queryByText("Grand total")).toBeNull();
  });

  it("a saved version still comparing products shows the same skeleton under its header", () => {
    panel([{ ...hero.versions[0], options: [] }]);
    expect(screen.getByRole("status", { name: "Comparing products…" }).querySelectorAll("[data-skeleton=row]").length).toBeGreaterThan(0);
  });
});

describe("Refine diff chip (DEMO Beat 2: \"Removed: uniform\")", () => {
  it("diffChips names removed items from the previous plan and added/changed ones from the new plan", () => {
    expect(diffChips(v2, hero.versions[0])).toEqual(["Removed: uniform shirt"]);
    const added: KitVersion = {
      ...v2,
      diff: { added: ["uniform"], removed: ["book-covers"], changed: ["backpack"] },
      plan: { ...v2.plan, items: [...v2.plan.items.filter((i) => i.key !== "book-covers"), hero.versions[0].plan.items.find((i) => i.key === "uniform")!] },
    };
    expect(diffChips(added, v2)).toEqual(["Added: uniform shirt", "Removed: book covers", "Changed: anti-hunchback backpack"]);
    expect(diffChips(hero.versions[0], undefined)).toEqual([]);
    expect(diffChips({ ...v2, diff: { added: [], removed: [], changed: [] } }, hero.versions[0])).toEqual([]);
  });

  it("the refine turn in the chat shows the chip", () => {
    render(
      <ChatColumn versions={[hero.versions[0], v2]} run={null} summaries={{}} busy={false} onSend={noop} onChooseBudget={noop} onRetry={noop} />,
    );
    const chips = screen.getByRole("list", { name: "What changed" });
    expect(chips.textContent).toBe("Removed: uniform shirt");
  });
});

describe("Seller Centre loading state", () => {
  it("LiveStrip with recent = null (insights not loaded yet) says Loading, not the empty state", () => {
    render(<LiveStrip recent={null} now={0} />);
    expect(screen.getByText("Loading live searches…")).toBeTruthy();
    expect(screen.queryByText("No live searches yet — try Kitly")).toBeNull();
  });

  it("before the first insights response the screen shows no false 'No live searches yet'", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<SellerScreen initialShopId="shop-minhan" demoToday="2026-09-02" />);
    expect(screen.queryByText("No live searches yet — try Kitly")).toBeNull();
    expect(screen.getByText("Loading live searches…")).toBeTruthy();
  });
});
