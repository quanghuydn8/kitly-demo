// Keyword search results (classic search; "Describe your need" goes to /kit instead).
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ProductGrid } from "@/components/ProductGrid";
import { getAdapter } from "@/server/adapter";
import { listProductsWithShop } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const a = getAdapter();
  const [products, vouchers] = await Promise.all([
    q ? listProductsWithShop(a, { text: q, limit: 40 }) : Promise.resolve([]),
    a.listVouchers(),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-lg text-gray-800">
        {q ? (
          <>
            {products.length} result{products.length === 1 ? "" : "s"} for <b>“{q}”</b>
          </>
        ) : (
          "Type something to search"
        )}
      </h1>
      {q && (
        <Link
          href={`/kit?q=${encodeURIComponent(q)}`}
          className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-[var(--accent)]"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          Shopping for a whole need? Ask Kitly to build the kit for “{q}”.
        </Link>
      )}
      {products.length > 0 ? (
        <ProductGrid products={products} vouchers={vouchers} />
      ) : (
        q && (
          <div className="rounded-2xl bg-white p-8 text-center text-gray-500">
            No products match these words.
          </div>
        )
      )}
    </div>
  );
}
