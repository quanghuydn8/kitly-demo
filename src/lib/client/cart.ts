// Cart model (pure): lines carry a snapshot of what the cart page needs, so it renders without refetching.
// Totals mirror POST /api/checkout: Σ price×qty + one shipFee per shop; vouchers are not applied in the plain cart.
import type { ProductWithShop } from "@/contract/types";

export interface CartItem {
  productId: string;
  title: string;
  category: string;
  price: number;
  shopId: string;
  shopName: string;
  shipFee: number;
}
export interface CartLine extends CartItem {
  quantity: number;
}
export interface CartShopGroup {
  shopId: string;
  shopName: string;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
}
export interface CartSummary {
  groups: CartShopGroup[];
  itemsTotal: number;
  shippingTotal: number;
  grandTotal: number;
}

export function toCartItem(p: ProductWithShop): CartItem {
  return {
    productId: p.id,
    title: p.title,
    category: p.category,
    price: p.price,
    shopId: p.shop.id,
    shopName: p.shop.name,
    shipFee: p.shop.shipFee,
  };
}

export function addToCart(cart: CartLine[], item: CartItem, quantity = 1): CartLine[] {
  if (quantity <= 0) return cart;
  const existing = cart.find((l) => l.productId === item.productId);
  if (!existing) return [...cart, { ...item, quantity }];
  return cart.map((l) => (l.productId === item.productId ? { ...l, quantity: l.quantity + quantity } : l));
}

export function setQuantity(cart: CartLine[], productId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return cart.filter((l) => l.productId !== productId);
  return cart.map((l) => (l.productId === productId ? { ...l, quantity } : l));
}

export const cartCount = (cart: CartLine[]) => cart.reduce((n, l) => n + l.quantity, 0);

/** Groups in first-added order of each shop. */
export function cartSummary(cart: CartLine[]): CartSummary {
  const byShop = new Map<string, CartShopGroup>();
  for (const l of cart) {
    let g = byShop.get(l.shopId);
    if (!g) {
      g = { shopId: l.shopId, shopName: l.shopName, lines: [], subtotal: 0, shipping: l.shipFee };
      byShop.set(l.shopId, g);
    }
    g.lines.push(l);
    g.subtotal += l.price * l.quantity;
  }
  const groups = [...byShop.values()];
  const itemsTotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const shippingTotal = groups.reduce((s, g) => s + g.shipping, 0);
  return { groups, itemsTotal, shippingTotal, grandTotal: itemsTotal + shippingTotal };
}
