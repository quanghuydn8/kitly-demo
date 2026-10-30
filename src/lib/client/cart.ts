// Cart model (client state, T10): pure functions, no React. Shipping = one fee per shop (same rule as
// POST /api/checkout in src/server/store.ts), no vouchers in the plain storefront cart.
import type { Shop } from "@/contract";

/** A cart line keeps a snapshot of what the cart page needs, so the cart renders without refetching. */
export interface CartLine {
  productId: string;
  title: string;
  category: string;
  price: number;
  quantity: number;
  shop: Shop;
}

export interface CartShopGroup {
  shop: Shop;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
}

export interface CartTotals {
  shops: CartShopGroup[];
  itemsTotal: number;
  shippingTotal: number;
  grandTotal: number;
  count: number;
}

/** Same product ⇒ quantities merge; new products go to the end. */
export function addToCart(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.productId === line.productId);
  if (i < 0) return [...lines, line];
  return lines.map((l, j) => (j === i ? { ...l, quantity: l.quantity + line.quantity } : l));
}

/** quantity < 1 removes the line. */
export function setQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  if (quantity < 1) return lines.filter((l) => l.productId !== productId);
  return lines.map((l) => (l.productId === productId ? { ...l, quantity } : l));
}

/** Groups by shop in first-added order; each shop pays its shipFee once. */
export function cartTotals(lines: CartLine[]): CartTotals {
  const groups = new Map<string, CartShopGroup>();
  for (const l of lines) {
    const g = groups.get(l.shop.id) ?? { shop: l.shop, lines: [], subtotal: 0, shipping: l.shop.shipFee };
    g.lines.push(l);
    g.subtotal += l.price * l.quantity;
    groups.set(l.shop.id, g);
  }
  const shops = [...groups.values()];
  const itemsTotal = shops.reduce((s, g) => s + g.subtotal, 0);
  const shippingTotal = shops.reduce((s, g) => s + g.shipping, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return { shops, itemsTotal, shippingTotal, grandTotal: itemsTotal + shippingTotal, count };
}
