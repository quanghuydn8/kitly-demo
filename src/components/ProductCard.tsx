// Store product card: icon tile (no images), 2-line title, price, rating, reviews, sold, tier/voucher/updated badges.
import Link from "next/link";
import { Star } from "lucide-react";
import type { ProductWithShop, Voucher } from "@/contract/types";
import { formatCount, formatVnd } from "@/lib/client/format";
import { TierBadge, UpdatedBadge, VoucherBadge } from "./Badges";
import { CategoryIcon } from "./CategoryIcon";

export function ProductCard({
  product,
  shopVoucher,
}: {
  product: ProductWithShop;
  shopVoucher: Voucher | null;
}) {
  return (
    <Link
      href={`/product/${product.id}`}
      className="flex flex-col overflow-hidden rounded-2xl bg-white p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <CategoryIcon category={product.category} />
      <div className="mt-2 flex flex-1 flex-col gap-1 px-1 pb-1">
        <div className="flex flex-wrap gap-1">
          <TierBadge tier={product.shop.tier} />
          {product.updatedForDemandAt && <UpdatedBadge />}
        </div>
        <h3 className="line-clamp-2 text-sm leading-snug text-gray-800">{product.title}</h3>
        {shopVoucher && (
          <div>
            <VoucherBadge voucher={shopVoucher} />
          </div>
        )}
        <div className="mt-auto pt-1 text-base font-semibold text-[var(--accent)]">
          {formatVnd(product.price)}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <span>{product.rating.toFixed(1)}</span>
          <span>({product.reviewCount})</span>
          <span className="ml-auto">{formatCount(product.soldCount)} sold</span>
        </div>
        {product.stock === 0 && <div className="text-xs font-medium text-gray-400">Out of stock</div>}
      </div>
    </Link>
  );
}
