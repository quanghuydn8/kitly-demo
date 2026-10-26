// Seam: the client cart model (src/lib/client/cart.ts) — pure state transitions + totals grouped by shop.
// Totals must agree with POST /api/checkout: items + one shipFee per shop, no vouchers.
import { describe, expect, it } from "vitest";
import { fixtures } from "@/contract/fixtures";
import type { ProductWithShop } from "@/contract/types";
import { addToCart, cartCount, cartSummary, setQuantity, toCartItem, type CartLine } from "@/lib/client/cart";
import { InMemoryAdapter } from "@/server/adapter/memory";
import { checkout } from "@/server/store";

const withShop = (id: string): ProductWithShop => {
  const p = fixtures.products.find((x) => x.id === id)!;
  return { ...p, shop: fixtures.shops.find((s) => s.id === p.shopId)! };
};
const minhanBackpack = withShop("prod-minhan-backpack"); // 349,000 @ Minh An (ship 25,000)
const kidzoneBackpack = withShop("prod-kidzone-ergo-backpack"); // 890,000 @ KidZone (ship 30,000)
const minhanOther = withShop(
  fixtures.products.find((p) => p.shopId === "shop-minhan" && p.id !== "prod-minhan-backpack")!.id,
);

describe("cart", () => {
  it("adding the same product twice merges into one line", () => {
    let cart: CartLine[] = [];
    cart = addToCart(cart, toCartItem(minhanBackpack), 1);
    cart = addToCart(cart, toCartItem(minhanBackpack), 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(cartCount(cart)).toBe(3);
  });

  it("setQuantity changes a line and 0 removes it", () => {
    let cart = addToCart([], toCartItem(minhanBackpack), 1);
    cart = addToCart(cart, toCartItem(kidzoneBackpack), 1);
    cart = setQuantity(cart, minhanBackpack.id, 4);
    expect(cart.find((l) => l.productId === minhanBackpack.id)!.quantity).toBe(4);
    cart = setQuantity(cart, kidzoneBackpack.id, 0);
    expect(cart.map((l) => l.productId)).toEqual([minhanBackpack.id]);
  });

  it("groups lines by shop with one shipping fee per shop", () => {
    let cart = addToCart([], toCartItem(minhanBackpack), 2);
    cart = addToCart(cart, toCartItem(kidzoneBackpack), 1);
    cart = addToCart(cart, toCartItem(minhanOther), 1);
    const s = cartSummary(cart);

    expect(s.groups.map((g) => g.shopName)).toEqual(["Minh An Stationery", "KidZone Mall"]);
    const minhan = s.groups[0];
    expect(minhan.lines).toHaveLength(2);
    expect(minhan.subtotal).toBe(2 * 349000 + minhanOther.price);
    expect(minhan.shipping).toBe(25000);
    expect(s.groups[1]).toMatchObject({ subtotal: 890000, shipping: 30000 });

    expect(s.itemsTotal).toBe(698000 + minhanOther.price + 890000);
    expect(s.shippingTotal).toBe(55000);
    expect(s.grandTotal).toBe(s.itemsTotal + 55000);
  });

  it("an empty cart totals 0", () => {
    expect(cartSummary([])).toEqual({ groups: [], itemsTotal: 0, shippingTotal: 0, grandTotal: 0 });
  });

  it("grand total matches what POST /api/checkout charges", async () => {
    let cart = addToCart([], toCartItem(minhanBackpack), 2);
    cart = addToCart(cart, toCartItem(kidzoneBackpack), 1);
    const server = await checkout(
      new InMemoryAdapter(),
      cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    );
    expect(cartSummary(cart).grandTotal).toBe(server.grandTotal);
    expect(server.grandTotal).toBe(698000 + 890000 + 25000 + 30000);
  });
});
