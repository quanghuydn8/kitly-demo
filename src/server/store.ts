// Store service over the CommerceAdapter: what the classic storefront endpoints need (CONTRACT §3 "Store").
import type { CommerceAdapter, PersonaId, Product, ProductWithShop, Shop, Voucher } from "@/contract";

export const DEFAULT_PRODUCT_LIMIT = 40;

async function shopMap(adapter: CommerceAdapter): Promise<Map<string, Shop>> {
  return new Map((await adapter.listShops()).map((s) => [s.id, s]));
}

export async function listProductsWithShop(
  adapter: CommerceAdapter,
  q: { text?: string; category?: string; limit?: number },
): Promise<ProductWithShop[]> {
  const [products, shops] = await Promise.all([
    adapter.searchProducts({ text: q.text, category: q.category, limit: q.limit ?? DEFAULT_PRODUCT_LIMIT }),
    shopMap(adapter),
  ]);
  return products.flatMap((p) => {
    const shop = shops.get(p.shopId);
    return shop ? [{ ...p, shop }] : [];
  });
}

/** Vouchers usable on a product: platform vouchers + that shop's, public or in the persona's wallet. */
export function vouchersForProduct(product: Product, vouchers: Voucher[]): Voucher[] {
  return vouchers.filter((v) => v.scope === "platform" || v.shopId === product.shopId);
}

export async function productDetail(
  adapter: CommerceAdapter,
  id: string,
  persona: PersonaId,
): Promise<{ product: Product; shop: Shop; vouchers: Voucher[] } | null> {
  const product = await adapter.getProduct(id);
  if (!product) return null;
  const [shops, vouchers] = await Promise.all([shopMap(adapter), adapter.listVouchers(persona)]);
  const shop = shops.get(product.shopId);
  if (!shop) return null;
  return { product, shop, vouchers: vouchersForProduct(product, vouchers) };
}

export class CheckoutError extends Error {}

/** Fake checkout: items + one shipping fee per shop (no vouchers, nothing persisted). */
export async function checkout(
  adapter: CommerceAdapter,
  lines: { productId: string; quantity: number }[],
): Promise<{ orderId: string; grandTotal: number }> {
  const shops = await shopMap(adapter);
  let items = 0;
  const shopIds = new Set<string>();
  for (const line of lines) {
    const p = await adapter.getProduct(line.productId);
    if (!p) throw new CheckoutError(`Unknown product ${line.productId}`);
    if (p.stock < line.quantity) throw new CheckoutError(`${p.title} is out of stock`);
    items += p.price * line.quantity;
    shopIds.add(p.shopId);
  }
  const shipping = [...shopIds].reduce((s, id) => s + (shops.get(id)?.shipFee ?? 0), 0);
  return { orderId: `ord-${crypto.randomUUID().slice(0, 8)}`, grandTotal: items + shipping };
}
