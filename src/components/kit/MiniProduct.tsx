// Compact product card used in kit rows (no images: category icon tile, PRD UI).
import Link from "next/link";
import { Star } from "lucide-react";
import type { Product, Shop } from "@/contract";
import { CategoryIcon } from "@/components/store/CategoryIcon";
import { TierBadge } from "@/components/store/badges";
import { formatShortDate, formatVnd } from "@/lib/client/format";

export function MiniProduct({ product, shop, arrivesBy }: { product: Product; shop: Shop; arrivesBy?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CategoryIcon category={product.category} className="h-11 w-11 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Link href={`/p/${product.id}`} className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
          {product.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <TierBadge tier={shop.tier} />
            {shop.name}
          </span>
          <span className="font-medium text-gray-800">{formatVnd(product.price)}</span>
          <span className="flex items-center gap-0.5">
            <Star aria-hidden className="h-3 w-3 fill-amber-400 text-amber-400" />
            {product.rating.toFixed(1)}
          </span>
          {arrivesBy && <span>Arrives {formatShortDate(arrivesBy)}</span>}
        </div>
      </div>
    </div>
  );
}
