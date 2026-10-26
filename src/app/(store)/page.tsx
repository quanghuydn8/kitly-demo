// DemoMart home: Kitly banner, event shelves, category grid. Data via the same server module as GET /api/products.
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { CATEGORIES, categoryById, EVENT_TYPES, type EventType } from "@/contract";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ProductGrid } from "@/components/ProductGrid";
import { EVENT_LABELS } from "@/lib/client/events";
import { getAdapter } from "@/server/adapter";
import { listProductsWithShop } from "@/server/store";

export const dynamic = "force-dynamic";
const SHELF_SIZE = 5;

export default async function Home() {
  const a = getAdapter();
  const [products, vouchers] = await Promise.all([listProductsWithShop(a, { limit: 500 }), a.listVouchers()]);
  const events = EVENT_TYPES.filter((e): e is Exclude<EventType, "other"> => e !== "other");
  const shelves = events
    .map((event) => ({
      event,
      products: products
        .filter((p) => categoryById(p.category)?.event === event && p.stock > 0)
        .sort((x, y) => y.soldCount - x.soldCount)
        .slice(0, SHELF_SIZE),
    }))
    .filter((s) => s.products.length > 0);

  return (
    <div className="space-y-6">
      <Link
        href="/kit"
        className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[var(--accent)] to-orange-400 p-4 text-white shadow-sm sm:p-6"
      >
        <Sparkles className="h-8 w-8 shrink-0" />
        <div className="flex-1">
          <div className="text-lg font-semibold sm:text-xl">Tell Kitly your need, get the whole kit</div>
          <div className="text-sm text-white/90">
            “My kid starts Grade 1, budget 1.5M” → a full basket, on budget, on time, vouchers applied.
          </div>
        </div>
        <ChevronRight className="h-6 w-6 shrink-0" />
      </Link>

      {shelves.map((s) => (
        <section key={s.event} className="rounded-2xl bg-white/60 p-3 sm:p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-800">{EVENT_LABELS[s.event]}</h2>
          <ProductGrid products={s.products} vouchers={vouchers} />
        </section>
      ))}

      <section className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Categories</h2>
        {events.map((event) => (
          <div key={event} className="mb-4 last:mb-0">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              {EVENT_LABELS[event]}
            </h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
              {CATEGORIES.filter((c) => c.event === event).map((c) => (
                <Link
                  key={c.id}
                  href={`/category/${c.id}`}
                  className="flex flex-col items-center gap-1 text-center"
                >
                  <CategoryIcon category={c.id} className="h-12 w-12" iconClassName="h-6 w-6" />
                  <span className="line-clamp-2 text-[11px] leading-tight text-gray-700">{c.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
