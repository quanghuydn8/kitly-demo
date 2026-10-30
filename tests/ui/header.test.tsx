// Store header (T10 Lean, D37): search vs "Describe your need" routing, My kits, cart count, Seller Centre link.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import shopsJson from "@/contract/fixtures/shops.json";
import { ShopSchema } from "@/contract";
import { CartProvider } from "@/lib/client/cart-store";
import { Header } from "@/components/store/Header";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const shop = ShopSchema.array().parse(shopsJson)[0];

function renderHeader(lines = [] as Parameters<typeof CartProvider>[0]["initialLines"]) {
  return render(
    <CartProvider initialLines={lines}>
      <Header />
    </CartProvider>,
  );
}

describe("Header", () => {
  it("searches products by default (GET /search?q=)", () => {
    renderHeader();
    const form = screen.getByRole("search");
    expect(form.getAttribute("action")).toBe("/search");
    expect(screen.getByRole("textbox").getAttribute("name")).toBe("q");
  });

  it("routes need mode to /kit/new?q= after toggling 'Describe your need'", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("radio", { name: "Describe your need" }));
    expect(screen.getByRole("search").getAttribute("action")).toBe("/kit/new");
    expect(screen.getByRole("textbox").getAttribute("name")).toBe("q");
    fireEvent.click(screen.getByRole("radio", { name: "Search products" }));
    expect(screen.getByRole("search").getAttribute("action")).toBe("/search");
  });

  it("links My kits to /kit and Seller Centre to /seller", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "My kits" }).getAttribute("href")).toBe("/kit");
    expect(screen.getByRole("link", { name: "Seller Centre" }).getAttribute("href")).toBe("/seller");
  });

  it("shows the cart item count on the cart link", () => {
    renderHeader([
      { productId: "a", title: "A", category: "notebooks", price: 1000, quantity: 2, shop },
      { productId: "b", title: "B", category: "notebooks", price: 1000, quantity: 1, shop },
    ]);
    expect(screen.getByRole("link", { name: "Cart, 3 items" }).getAttribute("href")).toBe("/cart");
  });
});
