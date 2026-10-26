// Display formatting shared by store + Kitly screens. Money = integer VND (AGENTS.md).
import type { Voucher } from "@/contract/types";

const vnd = new Intl.NumberFormat("vi-VN");

/** 349000 → "349.000₫" */
export const formatVnd = (n: number) => `${vnd.format(n)}₫`;

/** 1930 → "1.9k", 950 → "950" */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

/** 30000 → "30k", 1500000 → "1.5M" (badge-sized money). */
export function formatShortVnd(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

/** Short voucher label for badges: "30k off", "10% off", "Free ship". */
export function voucherLabel(v: Voucher): string {
  if (v.kind === "fixed") return `${formatShortVnd(v.value)} off`;
  if (v.kind === "percent") return `${v.value}% off`;
  return "Free ship";
}

/** "2026-08-23" → "Aug 23" (UTC, no timezone drift). */
export function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
