// Seam (T13 — close the loop): what the buyer reads after a seller fixed a listing, the buyer ↔ seller links,
// and which result block the Kitly screen shows for each run state (skeleton / basket / empty / error).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { kitSample } from "@/contract/fixtures";
import type { BasketOption, KitPlan } from "@/contract/types";
import { Basket } from "@/components/kit/Basket";
import { KitResultSkeleton } from "@/components/kit/KitResultSkeleton";
import { TotalsPanel } from "@/components/kit/TotalsPanel";
import { BackToBuyer } from "@/components/seller/BackToBuyer";
import { buyerHref, recallKitQuery, rememberKitQuery } from "@/lib/client/last-query";
import { initialKitState, kitReducer, resultView, type KitState } from "@/lib/client/kit-state";

const optionsEv = kitSample.find((e) => e.event === "options")!;
const planEv = kitSample.find((e) => e.event === "plan")!;
if (optionsEv.event !== "options" || planEv.event !== "plan") throw new Error("fixture");
const option: BasketOption = optionsEv.data.options[0];
const plan: KitPlan = planEv.data.plan;

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const basket = (o: BasketOption) =>
  renderToStaticMarkup(createElement(Basket, { option: o, plan, diff: null }));

/** A Map-backed Storage stand-in (browser API, not one of our modules). */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe("Updated for this need — basket rows", () => {
  const enrichedFirst: BasketOption = {
    ...option,
    lines: option.lines.map((l, i) =>
      i === 0 ? { ...l, product: { ...l.product, updatedForDemandAt: "2026-08-20T08:00:00.000Z" } } : l,
    ),
  };

  it("shows the badge only on the row whose product was enriched", () => {
    const first = option.lines[0].itemKey;
    expect(basket(option)).not.toContain("Updated for this need");
    const html = basket(enrichedFirst);
    const row = html.slice(html.indexOf(`data-testid="line-${first}"`));
    const nextRow = row.indexOf('data-testid="line-', 20);
    expect(row.slice(0, nextRow === -1 ? undefined : nextRow)).toContain("Updated for this need");
    expect(html.match(/Updated for this need/g)).toHaveLength(1);
  });
});

describe("buyer ↔ seller links", () => {
  it("a noMatch row links to the seller view for all shops", () => {
    const html = basket(option);
    const gap = html.slice(html.indexOf('data-testid="nomatch-backpack"'));
    expect(gap).toContain('href="/seller?shop=all"');
    expect(text(gap)).toContain("See seller view →");
  });

  it("product rows have no seller link", () => {
    const o = { ...option, noMatch: [] };
    expect(basket(o)).not.toContain("/seller?shop=all");
  });

  it("Back to buyer goes to /kit, re-running the last need when one is remembered", () => {
    expect(buyerHref(null)).toBe("/kit");
    expect(buyerHref("  ")).toBe("/kit");
    expect(buyerHref("Grade 1, budget 1.5M & by 25/8")).toBe(
      "/kit?q=Grade%201%2C%20budget%201.5M%20%26%20by%2025%2F8",
    );
    const html = renderToStaticMarkup(createElement(BackToBuyer));
    expect(html).toContain('href="/kit"');
    expect(text(html)).toContain("Back to buyer");
  });

  it("remembers the last kit query (and survives storage that throws)", () => {
    const s = memoryStorage();
    expect(recallKitQuery(s)).toBeNull();
    rememberKitQuery("My kid starts Grade 1", s);
    expect(recallKitQuery(s)).toBe("My kid starts Grade 1");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => rememberKitQuery("x", broken)).not.toThrow();
    expect(recallKitQuery(broken)).toBeNull();
    expect(recallKitQuery(undefined)).toBeNull();
  });
});

describe("resultView — which result block the Kitly screen shows", () => {
  const started = kitReducer(initialKitState, { type: "start" });
  const done = kitSample.reduce<KitState>((s, e) => kitReducer(s, { type: "event", event: e }), started);

  it("idle without a query: nothing; idle with ?q= (first frame): skeleton", () => {
    expect(resultView(initialKitState, false)).toBe("none");
    expect(resultView(initialKitState, true)).toBe("skeleton");
  });

  it("running before options: skeleton; once options arrive: basket", () => {
    expect(resultView(started, true)).toBe("skeleton");
    const withOptions = kitReducer(started, { type: "event", event: optionsEv });
    expect(resultView(withOptions, true)).toBe("basket");
    expect(resultView(done, true)).toBe("basket");
  });

  it("done with no options at all: empty state", () => {
    const empty = kitReducer(started, { type: "event", event: { event: "done", data: { sessionId: "s" } } });
    expect(resultView(empty, true)).toBe("empty");
  });

  it("error before any basket: error state; error during refine keeps the old basket", () => {
    const failed = kitReducer(started, { type: "failed", message: "network down" });
    expect(resultView(failed, true)).toBe("error");
    const refining = kitReducer(done, { type: "start", refine: true });
    const refineFailed = kitReducer(refining, { type: "failed", message: "network down" });
    expect(resultView(refineFailed, true)).toBe("basket");
  });
});

describe("KitResultSkeleton — no layout shift when the basket arrives", () => {
  it("reserves the basket + totals columns with placeholder rows, marked busy", () => {
    const html = renderToStaticMarkup(createElement(KitResultSkeleton));
    expect(html).toContain('data-testid="basket-skeleton"');
    expect(html).toContain('aria-busy="true"');
    // Same two-column grid as the real result block in KitScreen.
    expect(html).toContain("xl:grid-cols-[minmax(0,1fr)_320px]");
    expect(html.match(/data-skeleton-row/g)!.length).toBeGreaterThanOrEqual(5);
  });
});

describe("TotalsPanel — nothing buyable (off-catalog need)", () => {
  const empty: BasketOption = {
    ...option,
    lines: [],
    shops: [],
    savings: [],
    itemsTotal: 0,
    shippingTotal: 0,
    discountTotal: 0,
    grandTotal: 0,
  };

  it("says nothing can be bought yet instead of a row of zeros", () => {
    const html = renderToStaticMarkup(createElement(TotalsPanel, { option: empty, budget: null }));
    expect(text(html)).toContain("Nothing to buy yet");
    expect(html).not.toContain('data-testid="grand-total"');
    expect(html).not.toContain("-0₫");
  });

  it("never prints a negative zero discount", () => {
    const noDiscount = { ...option, discountTotal: 0 };
    const html = renderToStaticMarkup(createElement(TotalsPanel, { option: noDiscount, budget: 1_500_000 }));
    expect(html).not.toContain("-0₫");
    expect(html).toContain('data-testid="grand-total"');
  });
});
