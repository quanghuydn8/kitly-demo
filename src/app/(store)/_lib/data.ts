// Server-side loaders for the storefront pages. Everything goes through the CommerceAdapter (getAdapter), so the
// same pages run on the In-memory fixtures and on the seeded Supabase DB (KITLY_ADAPTER) without changes.
import { cookies } from "next/headers";
import { CATEGORIES, EVENTS, PersonaIdSchema, type EventType, type PersonaId, type ProductWithShop } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { PERSONA_COOKIE } from "@/server/http/request";

/** Buyer persona from the kitly_persona cookie; missing/invalid ⇒ "lan" (CONTRACT §2, D43). */
export async function currentPersona(): Promise<PersonaId> {
  const parsed = PersonaIdSchema.safeParse((await cookies()).get(PERSONA_COOKIE)?.value);
  return parsed.success ? parsed.data : "lan";
}

/** Shops with at least one shop-scoped voucher usable by the persona (drives the card's voucher badge). */
export async function shopIdsWithVoucher(): Promise<Set<string>> {
  const vouchers = await getAdapter().listVouchers(await currentPersona());
  return new Set(vouchers.flatMap((v) => (v.scope === "shop" && v.shopId ? [v.shopId] : [])));
}

async function attachShops(products: Awaited<ReturnType<ReturnType<typeof getAdapter>["searchProducts"]>>) {
  const shops = new Map((await getAdapter().listShops()).map((s) => [s.id, s]));
  return products.flatMap((p): ProductWithShop[] => {
    const shop = shops.get(p.shopId);
    return shop ? [{ ...p, shop }] : [];
  });
}

export interface Shelf {
  event: Exclude<EventType, "other">;
  label: string;
  color: string;
  products: ProductWithShop[];
}

/** One shelf per event: its best sellers across the event's categories. Empty shelves are dropped. */
export async function eventShelves(perShelf = 8): Promise<Shelf[]> {
  const events = Object.keys(EVENTS) as Exclude<EventType, "other">[];
  const shelves = await Promise.all(
    events.map(async (event) => {
      const categories = CATEGORIES.filter((c) => c.event === event).map((c) => c.id);
      const products = await getAdapter().searchProducts({ categories, limit: 200 });
      const top = products.sort((a, b) => b.soldCount - a.soldCount).slice(0, perShelf);
      return { event, ...EVENTS[event], products: await attachShops(top) };
    }),
  );
  return shelves.filter((s) => s.products.length > 0);
}
