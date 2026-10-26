// Client-side basket edits on a BasketOption (contract type). Swap recompute is an estimate the ticket allows:
// items total moves by the price difference; a shop entering the basket adds its shipFee, a shop leaving it removes
// its shipping, shop discount and FREESHIP coverage. Platform discount vouchers are left as the server computed them.
import type { BasketLine, BasketOption, Candidate } from "@/contract/types";
import type { CartItem } from "./cart";

/** DATA.md §3: platform FREESHIP covers shipping up to 30,000₫ per shop group. */
const FREESHIP_CAP = 30000;

export function swapAlternative(
  option: BasketOption,
  itemKey: string,
  altIndex: number,
  budget: number | null = null,
): BasketOption {
  const line = option.lines.find((l) => l.itemKey === itemKey);
  const alt = line?.alternatives[altIndex];
  if (!line || !alt) return option;

  const previous: Candidate = {
    product: line.product,
    shop: line.shop,
    score: 0,
    matchedTags: [],
    arrivesBy: "",
  };
  const swapped: BasketLine = {
    ...line,
    product: alt.product,
    shop: alt.shop,
    lineTotal: alt.product.price * line.quantity,
    reason: `Your pick from ${alt.shop.name}`,
    alternatives: line.alternatives.map((a, i) => (i === altIndex ? previous : a)),
  };
  const lines = option.lines.map((l) => (l.itemKey === itemKey ? swapped : l));
  const delta = swapped.lineTotal - line.lineTotal;

  let shops = option.shops.map((g) =>
    g.shopId === line.shop.id ? { ...g, subtotal: g.subtotal - line.lineTotal } : g,
  );
  let shippingDelta = 0;
  let discountDelta = 0;
  if (shops.some((g) => g.shopId === alt.shop.id)) {
    shops = shops.map((g) =>
      g.shopId === alt.shop.id ? { ...g, subtotal: g.subtotal + swapped.lineTotal } : g,
    );
  } else {
    shops = [
      ...shops,
      {
        shopId: alt.shop.id,
        shopName: alt.shop.name,
        subtotal: swapped.lineTotal,
        shipping: alt.shop.shipFee,
        shopDiscount: 0,
        voucherCodes: [],
      },
    ];
    shippingDelta += alt.shop.shipFee;
  }
  if (!lines.some((l) => l.shop.id === line.shop.id)) {
    const gone = shops.find((g) => g.shopId === line.shop.id)!;
    shippingDelta -= gone.shipping;
    const freeship = gone.voucherCodes.includes("FREESHIP") ? Math.min(gone.shipping, FREESHIP_CAP) : 0;
    discountDelta -= gone.shopDiscount + freeship;
    shops = shops.filter((g) => g.shopId !== line.shop.id);
  }

  const grandTotal = option.grandTotal + delta + shippingDelta - discountDelta;
  return {
    ...option,
    lines,
    shops,
    itemsTotal: option.itemsTotal + delta,
    shippingTotal: option.shippingTotal + shippingDelta,
    discountTotal: option.discountTotal + discountDelta,
    grandTotal,
    status: budget !== null && grandTotal > budget ? "over_budget" : option.status,
  };
}

export function kitToCartItems(option: BasketOption): { item: CartItem; quantity: number }[] {
  return option.lines.map((l) => ({
    item: {
      productId: l.product.id,
      title: l.product.title,
      category: l.product.category,
      price: l.product.price,
      shopId: l.shop.id,
      shopName: l.shop.name,
      shipFee: l.shop.shipFee,
    },
    quantity: l.quantity,
  }));
}
