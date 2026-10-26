// Store (DemoMart) reads + fake checkout, all through the CommerceAdapter.
import { randomUUID } from "node:crypto";
import type { CommerceAdapter, ProductQuery, ProductWithShop, Voucher } from "@/contract/types";

export async function listProductsWithShop(a: CommerceAdapter, q: ProductQuery): Promise<ProductWithShop[]> {
  const [products, shops] = await Promise.all([a.searchProducts(q), a.listShops()]);
  const byId = new Map(shops.map((s) => [s.id, s]));
  return products.flatMap((p) => {
    const shop = byId.get(p.shopId);
    return shop ? [{ ...p, shop }] : [];
  });
}

/** Platform vouchers + this shop's vouchers. */
export async function vouchersForShop(a: CommerceAdapter, shopId: string): Promise<Voucher[]> {
  return (await a.listVouchers()).filter((v) => v.scope === "platform" || v.shopId === shopId);
}

export class UnknownProductError extends Error {}

/**
 * Fake checkout: nothing persisted beyond a log line. grandTotal = Σ price×qty + one shipFee per shop.
 * Vouchers are not re-applied here (the Kitly basket shows them; the cart is a plain store cart).
 */
export async function checkout(a: CommerceAdapter, lines: { productId: string; quantity: number }[]) {
  const shops = new Map((await a.listShops()).map((s) => [s.id, s]));
  let items = 0;
  const shopIds = new Set<string>();
  for (const l of lines) {
    const p = await a.getProduct(l.productId);
    if (!p) throw new UnknownProductError(l.productId);
    items += p.price * l.quantity;
    shopIds.add(p.shopId);
  }
  const shipping = [...shopIds].reduce((sum, id) => sum + (shops.get(id)?.shipFee ?? 0), 0);
  const orderId = `DM-${randomUUID().slice(0, 8).toUpperCase()}`;
  const grandTotal = items + shipping;
  console.log(`[checkout] ${orderId} lines=${lines.length} grandTotal=${grandTotal}`);
  return { orderId, grandTotal };
}
