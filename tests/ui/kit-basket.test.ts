// Seam: client basket helpers (src/lib/client/kit-basket.ts): swapping a line to an alternative recomputes totals,
// and the whole kit converts to cart items for "Add kit to cart".
import { describe, expect, it } from "vitest";
import { kitSample } from "@/contract/fixtures";
import type { BasketOption } from "@/contract/types";
import { kitToCartItems, swapAlternative } from "@/lib/client/kit-basket";

const sample = kitSample.find((e) => e.event === "options")!;
if (sample.event !== "options") throw new Error();
const option: BasketOption = sample.data.options[0];

describe("swapAlternative", () => {
  it("swaps the line product to the alternative and moves the old product into alternatives", () => {
    const line = option.lines.find((l) => l.itemKey === "notebooks")!;
    const alt = line.alternatives[0];
    const next = swapAlternative(option, "notebooks", 0);
    const swapped = next.lines.find((l) => l.itemKey === "notebooks")!;
    expect(swapped.product.id).toBe(alt.product.id);
    expect(swapped.shop.id).toBe(alt.shop.id);
    expect(swapped.lineTotal).toBe(alt.product.price * line.quantity);
    expect(swapped.alternatives.map((a) => a.product.id)).toContain(line.product.id);
    expect(option.lines.find((l) => l.itemKey === "notebooks")!.product.id).toBe(line.product.id); // immutable
  });

  it("itemsTotal and grandTotal move by the price difference × quantity (shop already in basket)", () => {
    const line = option.lines.find((l) => l.itemKey === "uniform")!; // qty 2, alt from KidZone (already in basket)
    const alt = line.alternatives[0];
    const delta = alt.product.price * 2 - line.lineTotal;
    const next = swapAlternative(option, "uniform", 0);
    expect(next.itemsTotal).toBe(option.itemsTotal + delta);
    expect(next.grandTotal).toBe(option.grandTotal + delta);
    expect(next.shippingTotal).toBe(option.shippingTotal);
  });

  it("swapping to a shop not yet in the basket adds that shop's shipping; emptying a shop removes it", () => {
    const shoes = option.lines.find((l) => l.itemKey === "shoes")!; // the only KidZone line
    const fake = {
      ...shoes.alternatives[0],
      product: { ...option.lines[0].product, id: "x-new", shopId: "shop-new", price: 300000 },
      shop: {
        id: "shop-new",
        name: "New Shop",
        tier: "regular" as const,
        rating: 4.5,
        shipFee: 20000,
        city: "Hanoi",
      },
      score: 1,
      matchedTags: [],
      arrivesBy: "2026-08-24",
    };
    const opt: BasketOption = {
      ...option,
      lines: option.lines.map((l) => (l.itemKey === "shoes" ? { ...l, alternatives: [fake] } : l)),
    };
    const next = swapAlternative(opt, "shoes", 0);
    const kidzone = option.shops.find((s) => s.shopId === "shop-kidzone")!;
    expect(next.shops.map((s) => s.shopId)).toEqual(["shop-minhan", "shop-new"]);
    expect(next.shippingTotal).toBe(option.shippingTotal - kidzone.shipping + 20000);
    expect(next.itemsTotal).toBe(option.itemsTotal - 320000 + 300000);
    // KidZone's FREESHIP coverage (30,000, part of discountTotal) leaves with it; the new shop pays full shipping.
    expect(next.discountTotal).toBe(option.discountTotal - 30000);
    expect(next.grandTotal).toBe(next.itemsTotal + next.shippingTotal - next.discountTotal);
    expect(next.grandTotal).toBe(option.grandTotal - 20000 + 20000);
  });

  it("turns status over_budget when a swap pushes the total above the budget", () => {
    const line = option.lines.find((l) => l.itemKey === "notebooks")!;
    const pricey = { ...line.alternatives[0], product: { ...line.alternatives[0].product, price: 900000 } };
    const opt = {
      ...option,
      lines: option.lines.map((l) => (l.itemKey === "notebooks" ? { ...l, alternatives: [pricey] } : l)),
    };
    expect(swapAlternative(opt, "notebooks", 0, 1_500_000).status).toBe("over_budget");
    expect(swapAlternative(option, "notebooks", 0, 1_500_000).status).toBe("ok");
  });
});

describe("kitToCartItems", () => {
  it("one cart item per basket line with the line quantity and shop snapshot", () => {
    const items = kitToCartItems(option);
    expect(items).toHaveLength(option.lines.length);
    const uniform = items.find((i) => i.item.productId === "prod-minhan-uniform")!;
    expect(uniform.quantity).toBe(2);
    expect(uniform.item).toMatchObject({
      shopId: "shop-minhan",
      shopName: "Minh An Stationery",
      shipFee: 25000,
    });
  });
});
