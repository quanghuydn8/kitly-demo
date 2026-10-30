// DemoMart home (T10): Kitly teaser, event shelves (best sellers per occasion) and the category grid.
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CategoryGrid } from "@/components/store/CategoryGrid";
import { ProductCard } from "@/components/store/ProductCard";
import { eventShelves, shopIdsWithVoucher } from "./_lib/data";

// Live adapter data on every request (and no DB access at build time).
export const dynamic = "force-dynamic";

export default async function Home() {
  const [shelves, voucherShops] = await Promise.all([eventShelves(), shopIdsWithVoucher()]);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-[var(--kitly-accent)] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Shopping for an occasion?</h1>
          <p className="text-sm opacity-90">
            Describe your need and get the whole kit — within budget, arriving on time.
          </p>
        </div>
        <Link
          href="/kit/new"
          className="flex w-fit items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[var(--kitly-accent)]"
        >
          <Sparkles aria-hidden className="h-4 w-4" />
          Describe your need
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        <CategoryGrid />
      </section>

      {shelves.map((shelf) => (
        <section key={shelf.event} aria-label={shelf.label} className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <span className={`h-3 w-3 rounded-full ${shelf.color}`} aria-hidden />
            {shelf.label}
          </h2>
          <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 sm:gap-3">
            {shelf.products.map((p) => (
              <li key={p.id} className="w-36 shrink-0 snap-start sm:w-44">
                <ProductCard product={p} hasVoucher={voucherShops.has(p.shopId)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
