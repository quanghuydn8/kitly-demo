// Turns a priced selection into the contract's BasketOption pieces: lines (reason + alternatives),
// shop groups, savings lines and cost drivers. Code-generated English text (Explainer handles buyer language).
import type { BasketLine, Candidate, Saving, ShopGroup } from "@/contract";
import { lineTotal, type Pick, type Priced } from "./pricing";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const vnd = new Intl.NumberFormat("vi-VN");

export function formatVnd(n: number): string {
  return `${vnd.format(n)}₫`;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Up to 2 next-best candidates from other shops (one per shop), best score first. */
export function alternatives(all: Candidate[], chosen: Candidate): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set([chosen.shop.id]);
  for (const c of all) {
    if (seen.has(c.shop.id)) continue;
    seen.add(c.shop.id);
    out.push(c);
    if (out.length === 2) break;
  }
  return out;
}

function reason(p: Pick, all: Candidate[], consolidated: boolean, sameShopOthers: number): string {
  const arrives = `arrives ${shortDate(p.cand.arrivesBy)}`;
  if (consolidated)
    return `Same shop as ${sameShopOthers} other item${sameShopOthers === 1 ? "" : "s"}, ${arrives}`;
  const top = all[0];
  const cheapest = all.reduce((a, c) => (c.product.price < a.product.price ? c : a), all[0]);
  if (top.product.id === p.cand.product.id) return `Best match (${p.cand.product.rating}★), ${arrives}`;
  if (cheapest.product.id === p.cand.product.id) return `Lowest price, ${arrives}`;
  return `Good value for its rating, ${arrives}`;
}

/**
 * Lines in plan order. A line is "consolidated" when its standalone choice was at another shop
 * and it now shares a shop with other lines.
 */
export function buildLines(
  priced: Priced,
  picks: Pick[],
  allByItem: Map<string, Candidate[]>,
  standalone: Map<string, Candidate>,
): BasketLine[] {
  const shopCount = new Map<string, number>();
  for (const g of priced.groups) shopCount.set(g.shop.id, g.picks.length);
  return picks.map((p) => {
    const all = allByItem.get(p.item.key)!;
    const others = (shopCount.get(p.cand.shop.id) ?? 1) - 1;
    const alone = standalone.get(p.item.key);
    const consolidated = others > 0 && !!alone && alone.shop.id !== p.cand.shop.id;
    return {
      itemKey: p.item.key,
      product: p.cand.product,
      shop: p.cand.shop,
      quantity: p.item.quantity,
      lineTotal: lineTotal(p),
      reason: reason(p, all, consolidated, others),
      alternatives: alternatives(all, p.cand),
    };
  });
}

export function buildGroups(priced: Priced): ShopGroup[] {
  return priced.groups.map((g) => ({
    shopId: g.shop.id,
    shopName: g.shop.name,
    subtotal: g.subtotal,
    shipping: g.shipping,
    shopDiscount: g.shopDiscount,
    voucherCodes: [g.shopVoucher?.code, g.freeship?.code].filter((c): c is string => !!c),
  }));
}

/**
 * Real deductions only (F9): free-shipping cover + shop voucher per shop, then the platform voucher. No counterfactual
 * lines, so the amounts add up to `discountTotal` (the Discounts figure the UI shows).
 */
export function buildSavings(priced: Priced): Saving[] {
  const out: Saving[] = [];
  for (const g of priced.groups) {
    const amount = g.freeshipCover + g.shopDiscount;
    if (amount <= 0) continue;
    const parts: string[] = [];
    if (g.freeshipCover > 0) parts.push("free shipping");
    if (g.shopDiscount > 0) parts.push(g.shopVoucher ? `${g.shopVoucher.code} voucher` : "shop voucher");
    const what = parts.join(" + ");
    const label =
      g.picks.length > 1
        ? `Buy ${g.picks.length} items at ${g.shop.name}: ${what}`
        : `${what[0].toUpperCase()}${what.slice(1)} at ${g.shop.name}`;
    out.push({ label, amount });
  }
  if (priced.platformDiscount > 0) {
    out.push({
      label: priced.platformVoucher ? `Platform voucher ${priced.platformVoucher.code}` : "Platform voucher",
      amount: priced.platformDiscount,
    });
  }
  return out;
}

/** Top 3 lines by price, e.g. "School shoes: 320.000₫". */
export function costDrivers(picks: Pick[]): string[] {
  return [...picks]
    .sort((a, b) => lineTotal(b) - lineTotal(a))
    .slice(0, 3)
    .map((p) => `${p.item.needLabel}: ${formatVnd(lineTotal(p))}`);
}
