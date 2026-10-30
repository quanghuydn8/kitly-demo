// Responsive grid of product cards: 2 columns at 390 px, up to 5 on desktop.
import type { ProductWithShop } from "@/contract";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, voucherShops }: { products: ProductWithShop[]; voucherShops: Set<string> }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} hasVoucher={voucherShops.has(p.shopId)} />
        </li>
      ))}
    </ul>
  );
}
