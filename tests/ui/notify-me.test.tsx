// Buyer-side "Notify me" on noMatch rows (T12 Full, needs T07): POST /api/demand/watch with the item's gap key —
// the same key Seller Centre counts as "N buyers waiting".
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import { ThreadsSampleSchema, type BasketOption, type KitVersion } from "@/contract";
import { KitPanel } from "@/components/kit/KitPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const [hero] = ThreadsSampleSchema.parse(threadsJson);
const noop = () => {};
const v1 = hero.versions[0];
const heroNoMatch = v1.options.find((o) => o.profile === "balanced")!.noMatch[0];

function withNoMatch(rows: BasketOption["noMatch"]): KitVersion {
  return {
    ...v1,
    plan: {
      ...v1.plan,
      items: [
        ...v1.plan.items,
        {
          key: "dog-food",
          needLabel: "Dog food",
          category: null,
          required: true,
          quantity: 1,
          mustHaveTags: [],
          niceToHaveTags: [],
          maxUnitPrice: null,
        },
      ],
    },
    options: v1.options.map((o) => (o.profile === "balanced" ? { ...o, noMatch: rows } : o)),
  };
}

function stubWatch(status = 200) {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/demand/watch");
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(status === 200 ? { watchers: 3 } : { error: { code: "x", message: "no" } }), { status });
    }),
  );
  return bodies;
}

function panel(v: KitVersion) {
  render(
    <KitPanel versions={[v]} viewVersion={null} onViewVersion={noop} onRestore={noop} overrides={{}} onSwap={noop} onAddToCart={noop} />,
  );
}

describe("Notify me", () => {
  it("Not in store yet: Notify me watches `none|` and turns into a confirmation", async () => {
    const bodies = stubWatch();
    panel(withNoMatch([heroNoMatch, { itemKey: "dog-food", needLabel: "Dog food", reason: "no_category", closest: null }]));
    const block = screen.getByRole("region", { name: /Not in store yet \(1\)/ });
    fireEvent.click(within(block).getByRole("button", { name: "Notify me: Dog food" }));
    await within(block).findByText("We'll notify you");
    expect(bodies).toEqual([{ gapKey: "none|" }]);
  });

  it("No exact match row: Notify me watches category|sorted must-have tags", async () => {
    const bodies = stubWatch();
    panel(withNoMatch([heroNoMatch]));
    const row = screen.getByRole("list", { name: "No exact match" });
    fireEvent.click(within(row).getByRole("button", { name: `Notify me: ${heroNoMatch.needLabel}` }));
    await within(row).findByText("We'll notify you");
    expect(bodies).toEqual([{ gapKey: "school-backpack|anti-hunchback" }]);
  });

  it("a failed watch lets the buyer retry", async () => {
    stubWatch(500);
    panel(withNoMatch([heroNoMatch]));
    const btn = screen.getByRole("button", { name: `Notify me: ${heroNoMatch.needLabel}` });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole("button", { name: `Notify me: ${heroNoMatch.needLabel}` }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByText("We'll notify you")).toBeNull();
  });
});
