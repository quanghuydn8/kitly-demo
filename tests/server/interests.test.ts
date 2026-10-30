// findInterests (ticket 16, seam S10, CONTRACT Interest / D40): the persona's cart products that fit a plan item.
// Pure code over the Matcher's relaxed pool (category ∧ in stock ∧ arrives by the deadline).
import { describe, expect, it } from "vitest";
import { GUEST_PERSONA, type Persona } from "@/contract";
import { findInterests } from "@/server/kit/interests";
import { heroWorld, TODAY } from "./support/personal";
import { sloppyHeroPlan } from "./support/plans";

describe("findInterests: hero kit", () => {
  it("Lan: KidZone Lite for the backpack, LAN-KZ80 → 440.000₫, over the 400k limit by 40.000₫, missing anti-hunchback", async () => {
    const w = await heroWorld("lan");
    const interests = findInterests(w.plan, w.balanced, w.match.pool, w.persona, w.vouchers, TODAY);
    expect(interests).toHaveLength(1);
    const i = interests[0];
    expect(i).toMatchObject({
      itemKey: "backpack",
      addedToCartAt: "2026-08-19T09:30:00.000Z",
      walletVoucherCode: "LAN-KZ80",
      priceAfterVoucher: 440_000,
      overMaxPriceBy: 40_000,
      missingTags: ["anti-hunchback"],
    });
    expect(i.candidate.product.id).toBe("prod-kidzone-lite-backpack");
    expect(i.candidate.shop.id).toBe("shop-kidzone");
    expect(i.candidate.arrivesBy <= w.plan.deadline!).toBe(true);
    expect(w.balanced.lines.map((l) => l.product.id)).not.toContain("prod-kidzone-lite-backpack");
  });

  it("Guest: no interests (empty cart)", async () => {
    const w = await heroWorld("guest");
    expect(findInterests(w.plan, w.balanced, w.match.pool, w.persona, w.vouchers, TODAY)).toEqual([]);
  });

  it("guest persona never gets interests, even if handed a cart", async () => {
    const w = await heroWorld("lan");
    const guest: Persona = { ...GUEST_PERSONA, cart: w.persona.cart };
    expect(findInterests(w.plan, w.balanced, w.match.pool, guest, w.vouchers, TODAY)).toEqual([]);
  });

  it("not when the cart product is already the line's chosen product", async () => {
    const w = await heroWorld("lan");
    const lite = w.match.pool.backpack.find((c) => c.product.id === "prod-kidzone-lite-backpack")!;
    const option = {
      ...w.balanced,
      lines: [...w.balanced.lines, { itemKey: "backpack", product: lite.product, shop: lite.shop, quantity: 1, lineTotal: 520_000, reason: "x", alternatives: [] }],
    };
    expect(findInterests(w.plan, option, w.match.pool, w.persona, w.vouchers, TODAY)).toEqual([]);
  });

  it("not when the product cannot arrive by the deadline or no plan item has its category", async () => {
    const late = await heroWorld("lan", sloppyHeroPlan({ deadline: "2026-09-03" })); // ships in 1–2 days → Sep 4
    expect(findInterests(late.plan, late.balanced, late.match.pool, late.persona, late.vouchers, TODAY)).toEqual([]);
    const w = await heroWorld("lan");
    const noBackpack = { ...w.plan, items: w.plan.items.filter((i) => i.key !== "backpack") };
    expect(findInterests(noBackpack, w.balanced, w.match.pool, w.persona, w.vouchers, TODAY)).toEqual([]);
  });

  it("without a wallet voucher the best public shop voucher is used (KIDZONE10 = 50k max)", async () => {
    const w = await heroWorld("lan");
    const publicOnly = w.vouchers.filter((v) => v.ownerPersona === null);
    const [i] = findInterests(w.plan, w.balanced, w.match.pool, w.persona, publicOnly, TODAY);
    expect(i.walletVoucherCode).toBe("KIDZONE10");
    expect(i.priceAfterVoucher).toBe(470_000);
    expect(i.overMaxPriceBy).toBe(70_000);
  });
});
