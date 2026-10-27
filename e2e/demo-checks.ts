// Pure DOM-text readers for the Playwright demo test (e2e/demo.spec.ts). No Playwright import, so Vitest can
// unit-test them (tests/ui/demo-checks.test.ts) and `next build` type-checks them without the e2e dependency.

/** Seller gap keys (gapKeyFor) of the two planted demo needs — GapCard testid is `gap-${key}`. */
export const GAP_KEYS = {
  backpack: "school-backpack|anti-hunchback",
  raincoat: "kids-raincoat|backpack-cover",
} as const;

export const MINH_AN = { shopId: "shop-minhan", name: "Minh An Stationery" } as const;
export const HERO_PRODUCT = {
  id: "prod-minhan-backpack",
  title: "Minh An Kids Backpack New Model 2026",
} as const;

/** "1.430.000₫" (formatVnd, vi-VN) → 1430000. Takes the first amount in the text; the sign is ignored. */
export function parseVnd(text: string): number {
  const m = text.match(/(\d{1,3}(?:\.\d{3})*)\s*₫/);
  if (!m) throw new Error(`No VND amount in "${text}"`);
  return Number(m[1].replace(/\./g, ""));
}

/** Timeline plan detail "Planned 12 items" → 12. */
export function parsePlanned(text: string): number {
  const m = text.match(/Planned (\d+) items?/);
  if (!m) throw new Error(`No planned count in "${text}"`);
  return Number(m[1]);
}

/** Timeline search detail "Compared 71 products from 9 shops" → { products: 71, shops: 9 }. */
export function parseCompared(text: string): { products: number; shops: number } {
  const m = text.match(/Compared (\d+) products? from (\d+) shops?/);
  if (!m) throw new Error(`No compared counts in "${text}"`);
  return { products: Number(m[1]), shops: Number(m[2]) };
}

/** GapCard price band "300.000₫ – 400.000₫" → { p25, p75 }. */
export function parsePriceBand(text: string): { p25: number; p75: number } {
  const [a, b] = text.split("–");
  if (b === undefined) throw new Error(`No price band in "${text}"`);
  return { p25: parseVnd(a), p75: parseVnd(b) };
}

/** Sum of the savings lines (TotalsPanel) whose label names the shop. */
export function savingsAt(lines: { label: string; amount: string }[], shopName: string): number {
  return lines.filter((l) => l.label.includes(shopName)).reduce((sum, l) => sum + parseVnd(l.amount), 0);
}

/** Plan item keys the basket view does not show anywhere — as a line, an honest gap or "Skipped for budget". */
export function unaccountedItems(
  planKeys: string[],
  shown: { lines: string[]; noMatch: string[]; skipped: string[] },
): string[] {
  const seen = new Set([...shown.lines, ...shown.noMatch, ...shown.skipped]);
  return planKeys.filter((k) => !seen.has(k));
}
