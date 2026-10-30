// ProductCard (T10 Full): the badges a buyer sees on a storefront card, rendered from fixture products.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import productsJson from "@/contract/fixtures/products.json";
import shopsJson from "@/contract/fixtures/shops.json";
import { ProductSchema, ShopSchema, type ProductWithShop } from "@/contract";
import { ProductCard } from "@/components/store/ProductCard";

const products = ProductSchema.array().parse(productsJson);
const shops = ShopSchema.array().parse(shopsJson);
afterEach(cleanup);

function withShop(productId: string, overrides: Partial<ProductWithShop> = {}): ProductWithShop {
  const p = products.find((x) => x.id === productId)!;
  const shop = shops.find((s) => s.id === p.shopId)!;
  return { ...p, shop, ...overrides };
}

describe("ProductCard", () => {
  it("shows title, price in ₫, rating, review and sold counts, and links to the product page", () => {
    render(<ProductCard product={withShop("prod-minhan-backpack")} hasVoucher={false} />);
    expect(screen.getByText("Minh An Kids Backpack New Model 2026")).toBeTruthy();
    expect(screen.getByText("349.000 ₫")).toBeTruthy();
    expect(screen.getByText("4.8")).toBeTruthy();
    expect(screen.getByText("(412)")).toBeTruthy();
    expect(screen.getByText("1.930 sold")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/p/prod-minhan-backpack");
  });

  it("shows the Mall badge for a mall shop and Preferred for a preferred shop", () => {
    const { unmount } = render(<ProductCard product={withShop("prod-kidzone-ergo-backpack")} hasVoucher={false} />);
    expect(screen.getByText("Mall")).toBeTruthy();
    expect(screen.queryByText("Preferred")).toBeNull();
    unmount();
    render(<ProductCard product={withShop("prod-minhan-backpack")} hasVoucher={false} />);
    expect(screen.getByText("Preferred")).toBeTruthy();
    expect(screen.queryByText("Mall")).toBeNull();
  });

  it("shows no tier badge for a regular shop", () => {
    const regular = products.find((p) => p.shopId === "shop-bago")!;
    render(<ProductCard product={withShop(regular.id)} hasVoucher={false} />);
    expect(screen.queryByText("Mall")).toBeNull();
    expect(screen.queryByText("Preferred")).toBeNull();
  });

  it("shows the voucher badge only when the shop has a voucher", () => {
    const { unmount } = render(<ProductCard product={withShop("prod-minhan-backpack")} hasVoucher />);
    expect(screen.getByText("Voucher")).toBeTruthy();
    unmount();
    render(<ProductCard product={withShop("prod-minhan-backpack")} hasVoucher={false} />);
    expect(screen.queryByText("Voucher")).toBeNull();
  });

  it("shows 'Updated for this need' only when updatedForDemandAt is set", () => {
    const { unmount } = render(
      <ProductCard
        product={withShop("prod-minhan-backpack", { updatedForDemandAt: "2026-09-02T09:00:00Z" })}
        hasVoucher={false}
      />,
    );
    expect(screen.getByText("Updated for this need")).toBeTruthy();
    unmount();
    render(<ProductCard product={withShop("prod-minhan-backpack")} hasVoucher={false} />);
    expect(screen.queryByText("Updated for this need")).toBeNull();
  });
});
