// buildSalesContext (ticket 16, seam S10, CONTRACT SalesContext / D41): the code-built facts + hooks the follow-up
// may cite. Pure code.
import { describe, expect, it } from "vitest";
import type { BasketOption } from "@/contract";
import { findInterests } from "@/server/kit/interests";
import { buildSalesContext } from "@/server/kit/sales-context";
import { heroWorld, TODAY } from "./support/personal";
import { sloppyHeroPlan } from "./support/plans";

async function heroContext(persona: "lan" | "guest", raw?: object) {
  const w = await heroWorld(persona, raw);
  const option: BasketOption = {
    ...w.balanced,
    interests: findInterests(w.plan, w.balanced, w.match.pool, w.persona, w.vouchers, TODAY),
  };
  return { w, option, ctx: buildSalesContext(w.plan, option, w.persona, w.vouchers, TODAY, w.shops) };
}

describe("buildSalesContext: hero kit", () => {
  it("Lan: hooks start deadline_soon, cart_interest, voucher_expiring; daysLeft 3", async () => {
    const { ctx } = await heroContext("lan");
    expect(ctx.hooks.slice(0, 3)).toEqual(["deadline_soon", "cart_interest", "voucher_expiring"]);
    expect(ctx).toMatchObject({ today: "2026-09-02", deadline: "2026-09-05", daysLeft: 3, address: "Cau Giay, Hanoi" });
  });

  it("Lan: every field — interests, wallet vouchers (usedInBasket), favourite-shop promos", async () => {
    const { ctx, option } = await heroContext("lan");
    expect(ctx.interests).toEqual([
      {
        itemKey: "backpack",
        title: "KidZone Lite Backpack Grade 1–3",
        price: 520_000,
        priceAfterVoucher: 440_000,
        voucherCode: "LAN-KZ80",
        overMaxPriceBy: 40_000,
      },
    ]);
    const bts = ctx.walletVouchers.find((v) => v.code === "LAN-BTS10")!;
    expect(bts).toEqual({ code: "LAN-BTS10", label: "Back-to-school 10%", validUntil: "2026-09-04", daysToExpiry: 2, usedInBasket: true });
    expect(option.savings.some((s) => s.wallet)).toBe(true);
    const kz = ctx.walletVouchers.find((v) => v.code === "LAN-KZ80")!;
    expect(kz).toMatchObject({ daysToExpiry: 28 });
    expect(kz.usedInBasket).toBe(option.shops.some((s) => s.voucherCodes.includes("LAN-KZ80")));
    expect(ctx.favoriteShopPromos.map((p) => p.code).sort()).toEqual(["KIDZONE10", "LAN-KZ80"]);
    expect(ctx.favoriteShopPromos.every((p) => p.shopName === "KidZone Mall")).toBe(true);
    if (ctx.favoriteShopPromos.length) expect(ctx.hooks.at(-1)).toBe("favorite_shop_promo");
  });

  it("Guest: no address, interests, wallet vouchers or favourite-shop promos; still the deadline hook", async () => {
    const { ctx } = await heroContext("guest");
    expect(ctx).toMatchObject({ address: null, interests: [], walletVouchers: [], favoriteShopPromos: [], daysLeft: 3 });
    expect(ctx.hooks[0]).toBe("deadline_soon");
    expect(ctx.hooks).not.toContain("cart_interest");
    expect(ctx.hooks).not.toContain("voucher_expiring");
    expect(ctx.hooks).not.toContain("favorite_shop_promo");
  });

  it("no deadline ⇒ daysLeft null and no deadline_soon; a far deadline ⇒ no deadline_soon", async () => {
    const none = await heroContext("lan", sloppyHeroPlan({ deadline: null }));
    expect(none.ctx.daysLeft).toBeNull();
    expect(none.ctx.hooks).not.toContain("deadline_soon");
    const far = await heroContext("lan", sloppyHeroPlan({ deadline: "2026-09-20" }));
    expect(far.ctx.daysLeft).toBe(18);
    expect(far.ctx.hooks).not.toContain("deadline_soon");
  });

  it("freeship gap: a shop group below FREESHIP's 200k min spend by ≤ 100k is listed, with the hook", async () => {
    const { w, option } = await heroContext("guest");
    const g = { shopId: "shop-x", shopName: "Tiny Shop", subtotal: 150_000, shipping: 20_000, shopDiscount: 0, voucherCodes: [] };
    const far = { ...g, shopId: "shop-y", shopName: "Far Shop", subtotal: 50_000 };
    const ctx = buildSalesContext(w.plan, { ...option, shops: [...option.shops, g, far] }, w.persona, w.vouchers, TODAY, w.shops);
    expect(ctx.freeshipGaps).toContainEqual({ shopName: "Tiny Shop", missing: 50_000 });
    expect(ctx.freeshipGaps.map((x) => x.shopName)).not.toContain("Far Shop");
    expect(ctx.hooks).toContain("freeship_gap");
    expect(ctx.hooks.indexOf("freeship_gap")).toBeGreaterThan(ctx.hooks.indexOf("deadline_soon"));
  });

  it("no option (awaiting budget) ⇒ empty basket facts, persona facts kept", async () => {
    const { w } = await heroContext("lan");
    const ctx = buildSalesContext(w.plan, null, w.persona, w.vouchers, TODAY, w.shops);
    expect(ctx.interests).toEqual([]);
    expect(ctx.freeshipGaps).toEqual([]);
    expect(ctx.walletVouchers.every((v) => !v.usedInBasket)).toBe(true);
    expect(ctx.address).toBe("Cau Giay, Hanoi");
  });
});
