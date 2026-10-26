import { notFound } from "next/navigation";
import { categoryById } from "@/contract";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ProductGrid } from "@/components/ProductGrid";
import { EVENT_LABELS } from "@/lib/client/events";
import { getAdapter } from "@/server/adapter";
import { listProductsWithShop } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = categoryById(id);
  if (!category) notFound();
  const a = getAdapter();
  const [products, vouchers] = await Promise.all([
    listProductsWithShop(a, { category: id, limit: 100 }),
    a.listVouchers(),
  ]);
  products.sort((x, y) => y.soldCount - x.soldCount);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <CategoryIcon category={id} className="h-14 w-14" iconClassName="h-7 w-7" />
        <div>
          <div className="text-xs text-gray-500">{EVENT_LABELS[category.event]}</div>
          <h1 className="text-xl font-semibold text-gray-800">{category.label}</h1>
          <div className="text-sm text-gray-500">{products.length} products</div>
        </div>
      </div>
      {products.length > 0 ? (
        <ProductGrid products={products} vouchers={vouchers} />
      ) : (
        <div className="rounded-2xl bg-white p-8 text-center text-gray-500">
          No products in this category yet.
        </div>
      )}
    </div>
  );
}
