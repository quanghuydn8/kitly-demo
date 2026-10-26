// Responsive grid of product cards (2 cols at 390px). Voucher badge = best-value shop voucher of the product's shop.
import type { ProductWithShop, Voucher } from "@/contract/types";
import { ProductCard } from "./ProductCard";

export function shopVoucherMap(vouchers: Voucher[]): Map<string, Voucher> {
  const m = new Map<string, Voucher>();
  for (const v of vouchers) if (v.scope === "shop" && v.shopId && !m.has(v.shopId)) m.set(v.shopId, v);
  return m;
}

export function ProductGrid({ products, vouchers }: { products: ProductWithShop[]; vouchers: Voucher[] }) {
  const byShop = shopVoucherMap(vouchers);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} shopVoucher={byShop.get(p.shopId) ?? null} />
      ))}
    </div>
  );
}
