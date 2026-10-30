// Exact basket pricing (DATA.md §3 voucher rule): shop shipFee once per shop group; FREESHIP per group whose subtotal
// meets its min spend (covers up to its value, never more than the fee); at most one shop voucher per shop (best
// eligible on the group subtotal); at most one platform discount voucher (best eligible on itemsTotal).
// Wallet vouchers (ownerPersona != null) are ordinary vouchers here — the caller passes listVouchers(persona).
// ONE implementation, used by the search (grandTotal only) and by the final option (groups + savings).
import type { Candidate, Saving, Shop, ShopGroup, Voucher } from "@/contract";
import { freeshipLabel, platformVoucherLabel, shopVoucherLabel, type Lang } from "./labels";

interface Applied {
  v: Voucher;
  amount: number;
}

export interface GroupPrice {
  shop: Shop;
  subtotal: number;
  shipping: number;
  shopVoucher: Applied | null;
  freeship: Applied | null;
}

export interface PriceDetail {
  groups: GroupPrice[]; // shops with subtotal > 0, ordered by shopId
  platform: Applied | null;
  itemsTotal: number;
  shippingTotal: number;
  discountTotal: number;
  grandTotal: number;
}

/** Discount of one fixed/percent voucher on `base` (integer VND, floored). */
function discountOf(v: Voucher, base: number): number {
  if (v.kind === "fixed") return Math.min(v.value, base);
  if (v.kind === "percent") {
    const raw = Math.floor((base * v.value) / 100);
    return v.maxDiscount === null ? raw : Math.min(raw, v.maxDiscount);
  }
  return 0;
}

/** Best eligible voucher by amount (ties: lower id, deterministic). */
function best(list: Voucher[], base: number, amountOf: (v: Voucher) => number): Applied | null {
  let out: Applied | null = null;
  for (const v of list) {
    if (base < v.minSpend) continue;
    const amount = amountOf(v);
    if (amount <= 0) continue;
    if (!out || amount > out.amount || (amount === out.amount && v.id < out.v.id)) out = { v, amount };
  }
  return out;
}

export class Pricer {
  readonly shops: Shop[] = [];
  readonly shopIndex = new Map<string, number>();
  private shopVouchers: Voucher[][] = [];
  private freeship: Voucher[] = [];
  private platform: Voucher[] = [];
  private order: number[] = []; // shop indexes sorted by shopId

  constructor(shops: Shop[], candidates: Candidate[], vouchers: Voucher[], today: string) {
    for (const s of [...shops, ...candidates.map((c) => c.shop)]) {
      if (this.shopIndex.has(s.id)) continue;
      this.shopIndex.set(s.id, this.shops.length);
      this.shops.push(s);
      this.shopVouchers.push([]);
    }
    for (const v of vouchers) {
      if (v.validUntil < today) continue;
      if (v.kind === "freeship") this.freeship.push(v);
      else if (v.scope === "platform") this.platform.push(v);
      else if (v.shopId !== null && this.shopIndex.has(v.shopId))
        this.shopVouchers[this.shopIndex.get(v.shopId)!].push(v);
    }
    this.order = this.shops.map((_, i) => i).sort((a, b) => (this.shops[a].id < this.shops[b].id ? -1 : 1));
  }

  /** Price from per-shop subtotals (indexed like `shops`). */
  price(sub: ArrayLike<number>): PriceDetail {
    const groups: GroupPrice[] = [];
    let itemsTotal = 0;
    let shippingTotal = 0;
    let discountTotal = 0;
    let shopDiscounts = 0;
    for (const i of this.order) {
      const subtotal = sub[i];
      if (!(subtotal > 0)) continue;
      const shop = this.shops[i];
      const shipping = shop.shipFee;
      const shopVoucher = best(this.shopVouchers[i], subtotal, (v) => discountOf(v, subtotal));
      const freeship = best(this.freeship, subtotal, (v) => Math.min(v.value, shipping));
      itemsTotal += subtotal;
      shippingTotal += shipping;
      shopDiscounts += shopVoucher?.amount ?? 0;
      discountTotal += (shopVoucher?.amount ?? 0) + (freeship?.amount ?? 0);
      groups.push({ shop, subtotal, shipping, shopVoucher, freeship });
    }
    const left = itemsTotal - shopDiscounts; // a platform voucher never makes the items negative
    const platform = best(this.platform, itemsTotal, (v) => Math.min(discountOf(v, itemsTotal), left));
    discountTotal += platform?.amount ?? 0;
    return {
      groups,
      platform,
      itemsTotal,
      shippingTotal,
      discountTotal,
      grandTotal: itemsTotal + shippingTotal - discountTotal,
    };
  }
}

/** ShopGroup[] + Saving[] for the contract. Order: per group (shop voucher, then FREESHIP), then the platform voucher. */
export function describePrice(d: PriceDetail, lang: Lang): { shops: ShopGroup[]; savings: Saving[] } {
  const savings: Saving[] = [];
  const wallet = (v: Voucher) => (v.ownerPersona ? { wallet: true as const } : {});
  const shops = d.groups.map((g) => {
    if (g.shopVoucher)
      savings.push({
        label: shopVoucherLabel(g.shopVoucher.v, g.shop.name, lang),
        amount: g.shopVoucher.amount,
        ...wallet(g.shopVoucher.v),
      });
    if (g.freeship)
      savings.push({
        label: freeshipLabel(g.freeship.v, g.shop.name, lang),
        amount: g.freeship.amount,
        ...wallet(g.freeship.v),
      });
    return {
      shopId: g.shop.id,
      shopName: g.shop.name,
      subtotal: g.subtotal,
      shipping: g.shipping,
      shopDiscount: g.shopVoucher?.amount ?? 0,
      voucherCodes: [g.shopVoucher?.v.code, g.freeship?.v.code].filter((c): c is string => !!c),
    };
  });
  if (d.platform)
    savings.push({
      label: platformVoucherLabel(d.platform.v, lang),
      amount: d.platform.amount,
      ...wallet(d.platform.v),
    });
  return { shops, savings };
}
