// Code-made text for the Optimizer (savings lines, line reasons, fit labels) in the plan language.
import type { Voucher } from "@/contract";

export type Lang = "en" | "vi";

const VND = new Intl.NumberFormat("vi-VN");
/** 980000 → "980.000₫" (AGENTS.md: Intl vi-VN + ₫). */
export const formatVnd = (n: number) => `${VND.format(n)}₫`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-04" → en "Sep 4" / vi "4/9". */
export function shortDate(iso: string, lang: Lang): string {
  const [, m, d] = iso.split("-").map(Number);
  return lang === "vi" ? `${d}/${m}` : `${MONTHS[m - 1]} ${d}`;
}

// ---- savings (D46: wallet vouchers say so) ----
export const walletLabel = (v: Voucher, lang: Lang) =>
  lang === "vi" ? `Voucher trong ví của bạn ${v.label}` : `Your wallet voucher ${v.label}`;

export function freeshipLabel(v: Voucher, shopName: string, lang: Lang) {
  if (v.ownerPersona) return walletLabel(v, lang);
  return lang === "vi" ? `Miễn phí vận chuyển tại ${shopName}` : `Free shipping at ${shopName}`;
}

export function shopVoucherLabel(v: Voucher, shopName: string, lang: Lang) {
  if (v.ownerPersona) return walletLabel(v, lang);
  return lang === "vi" ? `${v.code} tại ${shopName}` : `${v.code} at ${shopName}`;
}

export function platformVoucherLabel(v: Voucher, lang: Lang) {
  if (v.ownerPersona) return walletLabel(v, lang);
  return lang === "vi" ? `Voucher sàn ${v.code}` : `Platform voucher ${v.code}`;
}

// ---- line reasons ----
export type ReasonKind = "saver" | "balanced" | "premium" | "consolidated" | "vouchers";

export function lineReason(
  kind: ReasonKind,
  lang: Lang,
  f: { arrivesBy: string; rating: number; shopName: string; others: number },
): string {
  const d = shortDate(f.arrivesBy, lang);
  if (lang === "vi") {
    switch (kind) {
      case "saver":
        return `Giá thấp nhất, đến ${d}`;
      case "premium":
        return `Đánh giá cao nhất (${f.rating}★), đến ${d}`;
      case "balanced":
        return `Đáng tiền nhất so với đánh giá, đến ${d}`;
      case "consolidated":
        return `Giao cùng ${f.others} món khác từ ${f.shopName}, đến ${d}`;
      case "vouchers":
        return `Tổng tiền tốt nhất sau voucher, đến ${d}`;
    }
  }
  switch (kind) {
    case "saver":
      return `Lowest price, arrives ${d}`;
    case "premium":
      return `Top rated (${f.rating}★), arrives ${d}`;
    case "balanced":
      return `Best value for the rating, arrives ${d}`;
    case "consolidated":
      return `Ships with ${f.others} other item${f.others === 1 ? "" : "s"} from ${f.shopName}, arrives ${d}`;
    case "vouchers":
      return `Best total after vouchers, arrives ${d}`;
  }
}

// ---- fit suggestions (D29): en "Drop Lunch box and switch Shoes to X: 980.000₫" / vi "Bỏ Hộp cơm, đổi Giày sang X: 980.000₫" ----
function joinList(xs: string[], and: string): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`;
}

export function fitLabel(
  drops: string[],
  swaps: { needLabel: string; title: string }[],
  grandTotal: number,
  lang: Lang,
): string {
  const parts: string[] = [];
  if (lang === "vi") {
    if (drops.length) parts.push(`bỏ ${joinList(drops, "và")}`);
    if (swaps.length) parts.push(`đổi ${swaps.map((s) => `${s.needLabel} sang ${s.title}`).join(", ")}`);
  } else {
    if (drops.length) parts.push(`drop ${joinList(drops, "and")}`);
    if (swaps.length)
      parts.push(
        `switch ${joinList(
          swaps.map((s) => `${s.needLabel} to ${s.title}`),
          "and",
        )}`,
      );
  }
  const text = parts.join(lang === "vi" ? ", " : " and ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}: ${formatVnd(grandTotal)}`;
}
