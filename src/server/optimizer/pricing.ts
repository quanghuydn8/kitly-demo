// Prices one candidate selection exactly: items + one shipping fee per shop group − vouchers.
// Voucher rules (DATA.md §3): per shop group the best FREESHIP covering up to its value when subtotal ≥ min spend,
// at most one shop voucher per shop (best meeting min spend), and at most one platform discount voucher per order
// (fixed/percent, min spend and percent measured on items − shop discounts). Pure; all money is integer VND.
import type { Candidate, PlanItem, Shop, Voucher } from "@/contract";

export interface Pick {
  item: PlanItem;
  cand: Candidate;
}

export interface PricedGroup {
  shop: Shop;
  picks: Pick[];
  subtotal: number;
  shipping: number;
  freeship: Voucher | null;
  freeshipCover: number;
  shopVoucher: Voucher | null;
  shopDiscount: number;
}

export interface Priced {
  groups: PricedGroup[];
  itemsTotal: number;
  shippingTotal: number;
  platformVoucher: Voucher | null;
  platformDiscount: number;
  discountTotal: number;
  grandTotal: number;
}

export function lineTotal(p: Pick): number {
  return p.cand.product.price * p.item.quantity;
}

/** Discount of a fixed/percent voucher on `base`; 0 when min spend is not met. */
function discountOn(v: Voucher, base: number): number {
  if (base < v.minSpend || base <= 0) return 0;
  if (v.kind === "fixed") return Math.min(v.value, base);
  if (v.kind === "percent") {
    const d = Math.floor((base * v.value) / 100);
    return Math.min(v.maxDiscount === null ? d : Math.min(d, v.maxDiscount), base);
  }
  return 0;
}

/** Best voucher by amount; ties broken by code so the result is deterministic. */
function best<T extends { v: Voucher; amount: number }>(xs: T[]): T | null {
  let out: T | null = null;
  for (const x of xs) {
    if (x.amount <= 0) continue;
    if (!out || x.amount > out.amount || (x.amount === out.amount && x.v.code < out.v.code)) out = x;
  }
  return out;
}

export class Pricer {
  private readonly shopById: Map<string, Shop>;
  private readonly platformFreeship: Voucher[];
  private readonly platformDiscounts: Voucher[];
  private readonly shopVouchers: Map<string, Voucher[]>;

  /** `today` (YYYY-MM-DD) filters out expired vouchers. */
  constructor(shops: Shop[], vouchers: Voucher[], today: string) {
    this.shopById = new Map(shops.map((s) => [s.id, s]));
    const valid = vouchers.filter((v) => v.validUntil >= today);
    this.platformFreeship = valid.filter((v) => v.scope === "platform" && v.kind === "freeship");
    this.platformDiscounts = valid.filter((v) => v.scope === "platform" && v.kind !== "freeship");
    this.shopVouchers = new Map();
    for (const v of valid) {
      if (v.scope !== "shop" || v.shopId === null) continue;
      const list = this.shopVouchers.get(v.shopId) ?? [];
      list.push(v);
      this.shopVouchers.set(v.shopId, list);
    }
  }

  price(picks: Pick[]): Priced {
    const byShop = new Map<string, Pick[]>();
    for (const p of picks) {
      const list = byShop.get(p.cand.shop.id);
      if (list) list.push(p);
      else byShop.set(p.cand.shop.id, [p]);
    }

    const groups: PricedGroup[] = [];
    let itemsTotal = 0;
    let shippingTotal = 0;
    let groupDiscounts = 0;
    let shopDiscounts = 0;
    for (const [shopId, gp] of byShop) {
      const shop = this.shopById.get(shopId) ?? gp[0].cand.shop;
      let subtotal = 0;
      for (const p of gp) subtotal += lineTotal(p);
      const shipping = shop.shipFee;

      const fs = best(
        this.platformFreeship.map((v) => ({
          v,
          amount: subtotal >= v.minSpend ? Math.min(v.value, shipping) : 0,
        })),
      );
      const freeshipCover = fs?.amount ?? 0;
      // A shop-scope freeship voucher competes with the shop's discount vouchers for the single shop-voucher slot.
      const sv = best(
        (this.shopVouchers.get(shopId) ?? []).map((v) => ({
          v,
          amount:
            v.kind === "freeship"
              ? subtotal >= v.minSpend
                ? Math.min(v.value, shipping - freeshipCover)
                : 0
              : discountOn(v, subtotal),
        })),
      );
      const shopDiscount = sv?.amount ?? 0;

      groups.push({
        shop,
        picks: gp,
        subtotal,
        shipping,
        freeship: fs?.v ?? null,
        freeshipCover,
        shopVoucher: sv?.v ?? null,
        shopDiscount,
      });
      itemsTotal += subtotal;
      shippingTotal += shipping;
      groupDiscounts += freeshipCover + shopDiscount;
      if (sv && sv.v.kind !== "freeship") shopDiscounts += shopDiscount;
    }

    const pv = best(
      this.platformDiscounts.map((v) => ({ v, amount: discountOn(v, itemsTotal - shopDiscounts) })),
    );
    const platformDiscount = pv?.amount ?? 0;
    const discountTotal = groupDiscounts + platformDiscount;
    return {
      groups,
      itemsTotal,
      shippingTotal,
      platformVoucher: pv?.v ?? null,
      platformDiscount,
      discountTotal,
      grandTotal: itemsTotal + shippingTotal - discountTotal,
    };
  }
}
