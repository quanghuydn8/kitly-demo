// Category page (T10): /c/<categoryId> lists that category's products.
import { notFound } from "next/navigation";
import { categoryById } from "@/contract";
import { CategoryIcon } from "@/components/store/CategoryIcon";
import { ProductGrid } from "@/components/store/ProductGrid";
import { getAdapter } from "@/server/adapter";
import { listProductsWithShop } from "@/server/store";
import { shopIdsWithVoucher } from "../../_lib/data";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = categoryById(id);
  if (!category) notFound();
  const [products, voucherShops] = await Promise.all([
    listProductsWithShop(getAdapter(), { category: id, limit: 200 }),
    shopIdsWithVoucher(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CategoryIcon category={id} className="h-12 w-12 rounded-full" />
        <div>
          <h1 className="text-lg font-semibold">{category.label}</h1>
          <p className="text-sm text-gray-500">
            {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      {products.length > 0 ? (
        <ProductGrid products={products} voucherShops={voucherShops} />
      ) : (
        <p className="rounded-xl bg-white p-8 text-center text-gray-500">No products in this category yet.</p>
      )}
    </div>
  );
}
