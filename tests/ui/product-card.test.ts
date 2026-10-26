// Seam: <ProductCard> rendered to HTML (react-dom/server). Asserts what the buyer sees: price, rating, counts, badges.
// (.ts + createElement because vitest.config only includes tests/**/*.test.ts and there is no jsdom/Testing Library.)
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixtures } from "@/contract/fixtures";
import type { ProductWithShop, Voucher } from "@/contract/types";
import { ProductCard } from "@/components/ProductCard";

const shop = (id: string) => fixtures.shops.find((s) => s.id === id)!;
const backpack: ProductWithShop = {
  ...fixtures.products.find((p) => p.id === "prod-minhan-backpack")!,
  shop: shop("shop-minhan"),
};
const minhan30 = fixtures.vouchers.find((v) => v.code === "MINHAN30")!;

const render = (product: ProductWithShop, shopVoucher: Voucher | null = null) =>
  renderToStaticMarkup(createElement(ProductCard, { product, shopVoucher }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("ProductCard", () => {
  it("shows title, VND price, rating, review and sold counts, and links to the product page", () => {
    const html = render(backpack);
    const t = text(html);
    expect(t).toContain("Minh An Kids Backpack New Model 2026");
    expect(t).toContain("349.000₫");
    expect(t).toContain("4.8");
    expect(t).toContain("(412)");
    expect(t).toContain("1.9k sold");
    expect(html).toContain('href="/product/prod-minhan-backpack"');
  });

  it("badges the shop tier: Preferred, Mall, and nothing for regular shops", () => {
    expect(text(render(backpack))).toContain("Preferred");
    const mall = { ...backpack, shop: shop("shop-kidzone") };
    expect(text(render(mall))).toContain("Mall");
    const regular = text(render({ ...backpack, shop: shop("shop-bago") }));
    expect(regular).not.toContain("Mall");
    expect(regular).not.toContain("Preferred");
  });

  it("shows a voucher badge only when the shop has a voucher", () => {
    expect(text(render(backpack, minhan30))).toContain("30k off");
    expect(text(render(backpack))).not.toMatch(/off/);
    const percent = fixtures.vouchers.find((v) => v.code === "KIDZONE10")!;
    expect(text(render(backpack, percent))).toContain("10% off");
  });

  it("shows 'Updated for this need' only when the listing was enriched", () => {
    expect(text(render(backpack))).not.toContain("Updated for this need");
    const enriched = { ...backpack, updatedForDemandAt: "2026-08-20T10:00:00.000Z" };
    expect(text(render(enriched))).toContain("Updated for this need");
  });
});
