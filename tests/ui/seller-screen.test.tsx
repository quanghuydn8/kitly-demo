// Seller Intelligence screen (T12 Full). Component seams on hand-built fixtures; the screen itself runs against a
// stubbed `fetch` (the HTTP boundary) so the Apply → "Fixed · Undo" state is shown to come from the API, not local state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import shopsJson from "@/contract/fixtures/shops.json";
import { GapCard } from "@/components/seller/GapCard";
import { LiveStrip } from "@/components/seller/LiveStrip";
import { PreviewDrawer } from "@/components/seller/PreviewDrawer";
import { SellerScreen } from "@/components/seller/SellerScreen";
import { backpackGap, insights, noneGap, preview, raincoatGap } from "./seller-fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const now = Date.parse("2026-09-02T10:00:00.000Z");
const noop = () => {};

describe("LiveStrip", () => {
  it("renders recent newest first with ago labels, event colour and 'Not in catalog' for null categories", () => {
    const recent = [...insights().recent].reverse(); // oldest first in → newest first out
    render(<LiveStrip recent={recent} now={now} />);
    const strip = screen.getByRole("region", { name: "Just searched (live)" });
    const rows = within(strip).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Anti-hunchback backpack");
    expect(rows[0].textContent).toContain("2 min ago");
    expect(rows[0].textContent).toContain("Back to school");
    expect(rows[1].textContent).toContain("Puppy leash");
    expect(rows[1].textContent).toContain("Not in catalog");
    expect(rows[1].textContent).toContain("20 min ago");
  });

  it("empty state", () => {
    render(<LiveStrip recent={[]} now={now} />);
    expect(screen.getByText("No live searches yet — try Kitly")).toBeTruthy();
  });
});

describe("GapCard", () => {
  it("listing gap: badge, weeks with ▲%, price band, needed with, advice, candidate + evidence, supply line", () => {
    render(<GapCard gap={backpackGap} busy={false} onPreview={noop} onUndo={noop} />);
    const card = screen.getByRole("article", { name: "Anti-hunchback backpack" });
    expect(within(card).getByText("Listing gap")).toBeTruthy();
    expect(card.textContent).toContain("38 this week");
    expect(card.textContent).toContain("21 last week");
    expect(card.textContent).toContain("▲81%");
    expect(card.textContent).toContain("300.000 ₫ – 400.000 ₫");
    expect(within(card).getByText("Notebooks")).toBeTruthy();
    expect(card.textContent).toContain(backpackGap.advice);
    expect(card.textContent).toContain("Minh An Kids Backpack New Model 2026");
    expect(card.textContent).toContain("“S-shaped straps keep the spine straight”");
    expect(card.textContent).toContain("1 listing could match if its tags were fixed");
    expect(card.textContent).not.toContain("Supply: 1 matching product");
    expect(within(card).getByRole("button", { name: "Preview fix" })).toBeTruthy();
  });

  it("Preview fix sends the candidate product and the gap key", () => {
    const onPreview = vi.fn();
    render(<GapCard gap={backpackGap} busy={false} onPreview={onPreview} onUndo={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview fix" }));
    expect(onPreview).toHaveBeenCalledWith("prod-minhan-backpack", "school-backpack|anti-hunchback");
  });

  it("a gap with appliedFix renders 'Fixed · Undo' on first render, and Undo targets the fixed product", () => {
    const onUndo = vi.fn();
    const fixed = {
      ...backpackGap,
      appliedFix: { productId: "prod-minhan-backpack", title: "Minh An Kids Backpack — Anti-hunchback", appliedAt: "2026-09-02T09:00:00Z" },
    };
    render(<GapCard gap={fixed} busy={false} onPreview={noop} onUndo={onUndo} />);
    const card = screen.getByRole("article", { name: "Anti-hunchback backpack" });
    expect(card.textContent).toContain("Fixed");
    expect(within(card).queryByRole("button", { name: "Preview fix" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledWith("prod-minhan-backpack");
  });

  it("assortment gap: amber badge, '0 shops selling', buyers waiting, no add-product button", () => {
    render(<GapCard gap={raincoatGap} busy={false} onPreview={noop} onUndo={noop} />);
    const card = screen.getByRole("article", { name: "Kids raincoat with backpack cover" });
    expect(within(card).getByText("Assortment gap")).toBeTruthy();
    expect(card.textContent).toContain("0 shops selling");
    expect(card.textContent).toContain("4 buyers waiting");
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
  });

  it("the grouped null-category gap shows its needLabel", () => {
    render(<GapCard gap={noneGap} busy={false} onPreview={noop} onUndo={noop} />);
    expect(screen.getByRole("article", { name: "Not in catalog: Dog food, Dog bed" })).toBeTruthy();
    expect(screen.getByText("No price hints yet")).toBeTruthy();
  });
});

describe("PreviewDrawer", () => {
  it("before/after title, added tags (green) vs kept (grey), attributes, description, keyword check ✓/✗", () => {
    const onApply = vi.fn();
    render(<PreviewDrawer preview={preview} busy={false} onApply={onApply} onClose={noop} />);
    const d = screen.getByRole("dialog", { name: "Preview fix" });
    expect(within(d).getByText(preview.before.title)).toBeTruthy();
    expect(within(d).getByText(preview.after.title)).toBeTruthy();
    const added = within(d).getByRole("list", { name: "Added tags" });
    expect(within(added).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["anti-hunchback", "lightweight", "grade-1"]);
    expect(within(added).getAllByRole("listitem")[0].className).toMatch(/green/);
    const kept = within(d).getByRole("list", { name: "Kept tags" });
    expect(within(kept).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["school", "kids"]);
    expect(within(kept).getAllByRole("listitem")[0].className).toMatch(/gray/);
    expect(d.textContent).toContain("back_support: S-shaped straps");
    expect(d.textContent).toContain("Anti-hunchback design for Grade 1.");
    const check = within(d).getByRole("list", { name: "Old keywords still match" });
    const rows = within(check).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["backpack ✓", "kids ✓", "model ✗"]);
    fireEvent.click(within(d).getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalled();
  });
});

// ---------- SellerScreen over a stubbed fetch ----------
type Handler = (url: string, init?: RequestInit) => unknown;
function stubFetch(handler: Handler) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: input, body });
      const out = handler(input, init);
      if (out instanceof Response) return out;
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

describe("SellerScreen", () => {
  let fixed: boolean;
  beforeEach(() => {
    fixed = false;
  });

  /** Fake server: insights reflect `fixed` (the API decides "Fixed · Undo"), apply/undo flip it. */
  const server: Handler = (url) => {
    if (url === "/api/shops") return { shops: shopsJson };
    if (url.startsWith("/api/seller/insights")) {
      const gap = fixed
        ? { ...backpackGap, appliedFix: { productId: "prod-minhan-backpack", title: "x", appliedAt: "2026-09-02T09:00:00Z" } }
        : backpackGap;
      return insights({ gaps: [gap, raincoatGap] });
    }
    if (url === "/api/seller/enrichment/preview") return preview;
    if (url === "/api/seller/enrichment/apply") {
      fixed = true;
      return { product: preview.after };
    }
    if (url === "/api/seller/enrichment/undo") {
      fixed = false;
      return { product: preview.before };
    }
    return new Response("{}", { status: 404 });
  };

  it("loads the ?shop= shop, renders KPIs, gaps in API order, combos and top needs", async () => {
    const calls = stubFetch(server);
    render(<SellerScreen initialShopId="shop-minhan" demoToday="2026-09-02" />);
    await screen.findByRole("article", { name: "Anti-hunchback backpack" });
    expect(calls.some((c) => c.url === "/api/seller/insights?shopId=shop-minhan")).toBe(true);
    expect((screen.getByLabelText("Shop") as HTMLSelectElement).value).toBe("shop-minhan");
    const cards = screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
    expect(cards).toEqual(["Anti-hunchback backpack", "Kids raincoat with backpack cover"]); // not re-sorted by thisWeek
    const kpi = screen.getByRole("region", { name: "This week" });
    expect(kpi.textContent).toContain("90"); // 38 + 52 unmet
    expect(kpi.textContent).toContain("120"); // searches
    expect(screen.getByRole("region", { name: "Bought together" }).textContent).toContain("Notebooks + School backpack");
    expect(screen.getByRole("region", { name: "Top needs by event" }).textContent).toContain("Back to school");
    expect(screen.getByRole("region", { name: "Just searched (live)" })).toBeTruthy();
  });

  it("changing shop re-fetches insights for it; All shops sends shopId=all", async () => {
    const calls = stubFetch(server);
    render(<SellerScreen initialShopId={null} demoToday="2026-09-02" />);
    await screen.findByRole("article", { name: "Anti-hunchback backpack" });
    expect(calls.some((c) => c.url === "/api/seller/insights?shopId=all")).toBe(true);
    fireEvent.change(screen.getByLabelText("Shop"), { target: { value: "shop-kidzone" } });
    await waitFor(() => expect(calls.some((c) => c.url === "/api/seller/insights?shopId=shop-kidzone")).toBe(true));
  });

  it("Preview fix → drawer → Apply → toast and 'Fixed · Undo' from the re-fetched API; Undo restores", async () => {
    const calls = stubFetch(server);
    render(<SellerScreen initialShopId="shop-minhan" demoToday="2026-09-02" />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview fix" }));
    const drawer = await screen.findByRole("dialog", { name: "Preview fix" });
    expect(calls.find((c) => c.url === "/api/seller/enrichment/preview")?.body).toEqual({
      productId: "prod-minhan-backpack",
      gapKey: "school-backpack|anti-hunchback",
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Apply" }));
    await screen.findByRole("status");
    expect(screen.getByRole("status").textContent).toContain("Listing updated");
    expect(calls.find((c) => c.url === "/api/seller/enrichment/apply")?.body).toEqual({ proposalId: "tok.sig" });
    const card = await screen.findByRole("article", { name: "Anti-hunchback backpack" });
    await waitFor(() => expect(card.textContent).toContain("Fixed"));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(within(screen.getByRole("article", { name: "Anti-hunchback backpack" })).getByRole("button", { name: "Undo" }));
    await screen.findByRole("button", { name: "Preview fix" });
    expect(calls.find((c) => c.url === "/api/seller/enrichment/undo")?.body).toEqual({ productId: "prod-minhan-backpack" });
  });

  it("Refresh re-fetches insights; the live strip re-fetches every 10 s while visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = stubFetch(server);
    render(<SellerScreen initialShopId="shop-minhan" demoToday="2026-09-02" />);
    await screen.findByRole("article", { name: "Anti-hunchback backpack" });
    const count = () => calls.filter((c) => c.url.startsWith("/api/seller/insights")).length;
    const before = count();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(count()).toBe(before + 1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await waitFor(() => expect(count()).toBe(before + 2));
  });

  it("an insights error shows a retryable message", async () => {
    stubFetch((url) =>
      url === "/api/shops" ? { shops: shopsJson } : new Response(JSON.stringify({ error: { code: "x", message: "boom" } }), { status: 500 }),
    );
    render(<SellerScreen initialShopId="shop-minhan" demoToday="2026-09-02" />);
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
  });
});
