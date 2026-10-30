// Display formatting shared by storefront and Kitly UI. Money is integer VND (AGENTS.md conventions).
const VND = new Intl.NumberFormat("vi-VN");
const COUNT = new Intl.NumberFormat("vi-VN");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 349000 → "349.000 ₫" */
export function formatVnd(amount: number): string {
  return `${VND.format(amount)} ₫`;
}

/** 1930 → "1.930" */
export function formatCount(n: number): string {
  return COUNT.format(n);
}

/** "2026-09-04" → "Sep 4" (parsed as a plain date: no timezone shift). */
export function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
