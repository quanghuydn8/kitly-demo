// Sales context (D41, CONTRACT SalesContext, seam S10): the code-built facts the follow-up (and the explainer / answer)
// may cite, from the persona, the plan and the chosen (Balanced) option. Pure code. Guest ⇒ no address, interests,
// wallet vouchers or favourite-shop promos. `hooks` = the hooks present, in the fixed priority order.
import type { BasketOption, KitPlan, Persona, SalesContext, SalesHook, Shop, Voucher } from "@/contract";
import { walletLabel } from "@/server/optimizer/labels";
import { daysBetween } from "@/server/today";

/** deadline_soon = daysLeft ≤ 3; voucher_expiring = a wallet voucher that expires within 3 days. */
export const SOON_DAYS = 3;
/** A shop group is a freeship gap when it misses FREESHIP's min spend by at most this much. */
export const FREESHIP_GAP_MAX = 100_000;

export function buildSalesContext(
  plan: KitPlan,
  option: BasketOption | null,
  persona: Persona,
  vouchers: Voucher[],
  today: string,
  shops: Shop[] = [],
): SalesContext {
  const known = persona.id !== "guest";
  const valid = vouchers.filter((v) => v.validUntil >= today);
  const daysLeft = plan.deadline === null ? null : daysBetween(today, plan.deadline);

  const interests = known
    ? (option?.interests ?? []).map((i) => ({
        itemKey: i.itemKey,
        title: i.candidate.product.title,
        price: i.candidate.product.price,
        priceAfterVoucher: i.priceAfterVoucher,
        voucherCode: i.walletVoucherCode,
        overMaxPriceBy: i.overMaxPriceBy,
      }))
    : [];

  const codesInBasket = new Set(option?.shops.flatMap((s) => s.voucherCodes) ?? []);
  const walletSavings = new Set((option?.savings ?? []).filter((s) => s.wallet).map((s) => s.label));
  const walletVouchers = known
    ? valid
        .filter((v) => v.ownerPersona === persona.id)
        .map((v) => ({
          code: v.code,
          label: v.label,
          validUntil: v.validUntil,
          daysToExpiry: daysBetween(today, v.validUntil),
          // platform vouchers are not in ShopGroup.voucherCodes: their saving line carries the wallet label instead
          usedInBasket: codesInBasket.has(v.code) || walletSavings.has(walletLabel(v, plan.language)),
        }))
    : [];

  const freeship = valid
    .filter((v) => v.kind === "freeship" && (v.ownerPersona === null || v.ownerPersona === persona.id))
    .sort((a, b) => a.minSpend - b.minSpend)[0];
  const freeshipGaps = freeship
    ? (option?.shops ?? []).flatMap((g) => {
        const missing = freeship.minSpend - g.subtotal;
        return missing > 0 && missing <= FREESHIP_GAP_MAX && !g.voucherCodes.includes(freeship.code)
          ? [{ shopName: g.shopName, missing }]
          : [];
      })
    : [];

  const shopName = (id: string) =>
    shops.find((s) => s.id === id)?.name ??
    option?.shops.find((g) => g.shopId === id)?.shopName ??
    option?.interests?.find((i) => i.candidate.shop.id === id)?.candidate.shop.name ??
    null;
  const favoriteShopPromos = known
    ? persona.favoriteShopIds.flatMap((id) => {
        const name = shopName(id);
        if (!name) return [];
        return valid
          .filter((v) => v.scope === "shop" && v.shopId === id && (v.ownerPersona === null || v.ownerPersona === persona.id))
          .map((v) => ({ shopName: name, code: v.code, label: v.label }));
      })
    : [];

  const hooks: SalesHook[] = [];
  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= SOON_DAYS) hooks.push("deadline_soon");
  if (interests.length) hooks.push("cart_interest");
  if (walletVouchers.some((v) => v.daysToExpiry >= 0 && v.daysToExpiry <= SOON_DAYS)) hooks.push("voucher_expiring");
  if (freeshipGaps.length) hooks.push("freeship_gap");
  if (favoriteShopPromos.length) hooks.push("favorite_shop_promo");

  return {
    today,
    deadline: plan.deadline,
    daysLeft,
    address: known && persona.address ? `${persona.address.district}, ${persona.address.city}` : null,
    interests,
    walletVouchers,
    freeshipGaps,
    favoriteShopPromos,
    hooks,
  };
}
