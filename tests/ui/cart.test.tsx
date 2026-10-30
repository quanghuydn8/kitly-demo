// Cart (T10 Full): lines grouped by shop, one shipping fee per shop, totals — worked example from fixtures:
// Minh An: backpack 349k×2 + notebooks 45k×3 = 833k, ship 25k · KidZone: ergo backpack 890k×1, ship 30k
// ⇒ items 1.723.000, shipping 55.000, grand 1.778.000.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import productsJson from "@/contract/fixtures/products.json";
import shopsJson from "@/contract/fixtures/shops.json";
import { ProductSchema, ShopSchema } from "@/contract";
import { addToCart, cartTotals, type CartLine } from "@/lib/client/cart";
import { CartProvider } from "@/lib/client/cart-store";
import { CartView } from "@/components/store/CartView";

const products = ProductSchema.array().parse(productsJson);
const shops = ShopSchema.array().parse(shopsJson);
afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function line(productId: string, quantity: number): CartLine {
  const p = products.find((x) => x.id === productId)!;
  const shop = shops.find((s) => s.id === p.shopId)!;
  return { productId, title: p.title, category: p.category, price: p.price, quantity, shop };
}

const EXAMPLE = [
  line("prod-minhan-backpack", 2),
  line("prod-kidzone-ergo-backpack", 1),
  line("prod-minhan-notebooks", 3),
];

describe("cartTotals", () => {
  it("groups lines by shop in first-added order with one shipping fee per shop", () => {
    const t = cartTotals(EXAMPLE);
    expect(t.shops.map((s) => [s.shop.name, s.lines.length, s.subtotal, s.shipping])).toEqual([
      ["Minh An Stationery", 2, 833_000, 25_000],
      ["KidZone Mall", 1, 890_000, 30_000],
    ]);
    expect(t.itemsTotal).toBe(1_723_000);
    expect(t.shippingTotal).toBe(55_000);
    expect(t.grandTotal).toBe(1_778_000);
    expect(t.count).toBe(6);
  });

  it("is all zero for an empty cart", () => {
    expect(cartTotals([])).toEqual({ shops: [], itemsTotal: 0, shippingTotal: 0, grandTotal: 0, count: 0 });
  });
});

describe("addToCart", () => {
  it("merges the same product into one line and adds new products at the end", () => {
    const a = addToCart([], line("prod-minhan-backpack", 1));
    const b = addToCart(a, line("prod-minhan-backpack", 2));
    const c = addToCart(b, line("prod-kidzone-pens", 1));
    expect(c.map((l) => [l.productId, l.quantity])).toEqual([
      ["prod-minhan-backpack", 3],
      ["prod-kidzone-pens", 1],
    ]);
  });
});

describe("CartView", () => {
  it("renders each shop with its subtotal and shipping, and the grand total", () => {
    render(
      <CartProvider initialLines={EXAMPLE}>
        <CartView />
      </CartProvider>,
    );
    const minhan = screen.getByRole("region", { name: "Minh An Stationery" });
    expect(within(minhan).getByText("833.000 ₫")).toBeTruthy();
    expect(within(minhan).getByText("25.000 ₫")).toBeTruthy();
    const kidzone = screen.getByRole("region", { name: "KidZone Mall" });
    expect(within(kidzone).getByText("30.000 ₫")).toBeTruthy();
    expect(within(screen.getByTestId("cart-summary")).getByText("1.778.000 ₫")).toBeTruthy();
  });

  it("updates totals when a quantity changes and drops a shop when its last line is removed", () => {
    render(
      <CartProvider initialLines={EXAMPLE}>
        <CartView />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Increase KidZone Ergo Spine-Care Backpack" }));
    // grand = 1.778.000 + 890.000
    expect(within(screen.getByTestId("cart-summary")).getByText("2.668.000 ₫")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove KidZone Ergo Spine-Care Backpack" }));
    expect(screen.queryByRole("region", { name: "KidZone Mall" })).toBeNull();
    // Minh An only: 833.000 + 25.000
    expect(within(screen.getByTestId("cart-summary")).getByText("858.000 ₫")).toBeTruthy();
  });

  it("shows an empty state when the cart is empty", () => {
    render(
      <CartProvider initialLines={[]}>
        <CartView />
      </CartProvider>,
    );
    expect(screen.getByText("Your cart is empty")).toBeTruthy();
  });
});
