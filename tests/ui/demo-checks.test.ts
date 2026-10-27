// Pure helpers the Playwright demo test (e2e/demo.spec.ts) uses to read numbers out of the DOM.
import { describe, expect, it } from "vitest";
import {
  GAP_KEYS,
  parseCompared,
  parsePlanned,
  parsePriceBand,
  parseVnd,
  savingsAt,
  unaccountedItems,
} from "../../e2e/demo-checks";
import { formatVnd } from "@/lib/client/format";
import { gapKeyFor } from "@/contract/gap-key";

describe("parseVnd", () => {
  it("reads what formatVnd prints", () => {
    for (const n of [0, 349000, 1430000, 1500000, 25000]) expect(parseVnd(formatVnd(n))).toBe(n);
  });
  it("ignores a leading minus sign and surrounding text", () => {
    expect(parseVnd("-30.000₫")).toBe(30000);
    expect(parseVnd("Total 1.000.000₫ of budget")).toBe(1000000);
  });
  it("throws when there is no amount", () => {
    expect(() => parseVnd("No limit")).toThrow();
  });
});

describe("timeline details", () => {
  it("reads the planned item count", () => {
    expect(parsePlanned("Planned 12 items")).toBe(12);
    expect(parsePlanned("Planned 1 item")).toBe(1);
    expect(() => parsePlanned("")).toThrow();
  });
  it("reads products and shops compared", () => {
    expect(parseCompared("Compared 71 products from 9 shops")).toEqual({ products: 71, shops: 9 });
    expect(() => parseCompared("Searching")).toThrow();
  });
});

describe("parsePriceBand", () => {
  it("reads both ends of the gap card price band", () => {
    expect(parsePriceBand(`${formatVnd(300000)} – ${formatVnd(400000)}`)).toEqual({
      p25: 300000,
      p75: 400000,
    });
    expect(() => parsePriceBand("—")).toThrow();
  });
});

describe("savingsAt", () => {
  const lines = [
    { label: "Buy 4 items at Minh An Stationery: one shipping fee instead of several", amount: "-75.000₫" },
    { label: "Buy 4 items at Minh An Stationery: free shipping + MINHAN30 voucher", amount: "-55.000₫" },
    { label: "Free shipping at KidZone Mall", amount: "-30.000₫" },
  ];
  it("sums every savings line that names the shop", () => {
    expect(savingsAt(lines, "Minh An Stationery")).toBe(130000);
    expect(savingsAt(lines, "Bago Bags")).toBe(0);
  });
});

describe("GAP_KEYS", () => {
  it("are the seller gap keys of the two planted demo needs", () => {
    expect(GAP_KEYS.backpack).toBe(gapKeyFor("school-backpack", ["anti-hunchback"]));
    expect(GAP_KEYS.raincoat).toBe(gapKeyFor("kids-raincoat", ["backpack-cover"]));
  });
});

describe("unaccountedItems", () => {
  it("lists plan items that are neither a basket line, a gap row nor skipped for budget", () => {
    const plan = ["notebooks", "raincoat", "lamp", "lunch-box"];
    const shown = { lines: ["notebooks"], noMatch: ["raincoat"], skipped: ["lamp"] };
    expect(unaccountedItems(plan, shown)).toEqual(["lunch-box"]);
  });
  it("is empty when every item is accounted for", () => {
    expect(unaccountedItems(["a", "b"], { lines: ["a", "b"], noMatch: [], skipped: [] })).toEqual([]);
  });
});
