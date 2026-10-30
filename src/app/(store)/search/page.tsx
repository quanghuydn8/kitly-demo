// Keyword search results (T10): GET /search?q= → adapter text search.
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ProductGrid } from "@/components/store/ProductGrid";
import { getAdapter } from "@/server/adapter";
import { listProductsWithShop } from "@/server/store";
import { shopIdsWithVoucher } from "../_lib/data";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const [products, voucherShops] = q
    ? await Promise.all([listProductsWithShop(getAdapter(), { text: q }), shopIdsWithVoucher()])
    : [[], new Set<string>()];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {q ? (
          <>
            {products.length} result{products.length === 1 ? "" : "s"} for “{q}”
          </>
        ) : (
          "Type something to search"
        )}
      </h1>
      {q && (
        <Link
          href={`/kit/new?q=${encodeURIComponent(q)}`}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <Sparkles aria-hidden className="h-4 w-4" />
          Buying for an occasion? Describe your need instead
        </Link>
      )}
      {products.length > 0 ? (
        <ProductGrid products={products} voucherShops={voucherShops} />
      ) : (
        q && <p className="rounded-xl bg-white p-8 text-center text-gray-500">No products match “{q}”.</p>
      )}
    </div>
  );
}
