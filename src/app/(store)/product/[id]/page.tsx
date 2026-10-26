// Product detail: description, tag chips, attributes, shop box, vouchers, "Arrives by" (DEMO_TODAY), add to cart.
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Star, Store, Truck } from "lucide-react";
import { categoryById } from "@/contract";
import { AddToCart } from "@/components/AddToCart";
import { TierBadge, UpdatedBadge, VoucherBadge } from "@/components/Badges";
import { CategoryIcon } from "@/components/CategoryIcon";
import { toCartItem } from "@/lib/client/cart";
import { formatCount, formatShortDate, formatVnd } from "@/lib/client/format";
import { getAdapter } from "@/server/adapter";
import { vouchersForShop } from "@/server/store";
import { addDays, today } from "@/server/today";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAdapter();
  const product = await a.getProduct(id);
  if (!product) notFound();
  const shop = (await a.listShops()).find((s) => s.id === product.shopId);
  if (!shop) notFound();
  const vouchers = await vouchersForShop(a, shop.id);
  const category = categoryById(product.category);
  const now = today();
  const arrivesFrom = formatShortDate(addDays(now, product.shipDaysMin));
  const arrivesBy = formatShortDate(addDays(now, product.shipDaysMax));
  const attributes = Object.entries(product.attributes);

  return (
    <div className="space-y-4">
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        {category && (
          <>
            {" › "}
            <Link href={`/category/${category.id}`} className="hover:underline">
              {category.label}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:p-6">
        <CategoryIcon
          category={product.category}
          className="aspect-square w-full max-w-sm justify-self-center"
        />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap gap-1">
            <TierBadge tier={shop.tier} />
            {product.updatedForDemandAt && <UpdatedBadge />}
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{product.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {product.rating.toFixed(1)}
            </span>
            <span>{formatCount(product.reviewCount)} reviews</span>
            <span>{formatCount(product.soldCount)} sold</span>
          </div>
          <div className="rounded-xl bg-orange-50 px-4 py-3 text-2xl font-bold text-[var(--accent)]">
            {formatVnd(product.price)}
          </div>
          {vouchers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">Vouchers</span>
              {vouchers.map((v) => (
                <span
                  key={v.id}
                  className="flex items-center gap-1"
                  title={`Min spend ${formatVnd(v.minSpend)}`}
                >
                  <VoucherBadge voucher={v} />
                  <span className="text-xs text-gray-500">
                    {v.code}
                    {v.minSpend > 0 && ` · min ${formatVnd(v.minSpend)}`}
                  </span>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Truck className="h-4 w-4 text-emerald-600" />
            <span>
              Arrives by <b data-testid="arrives-by">{arrivesBy}</b>
              <span className="text-gray-500">
                {" "}
                ({arrivesFrom}–{arrivesBy}) · shipping {formatVnd(shop.shipFee)}
              </span>
            </span>
          </div>
          <div className="text-sm text-gray-500">{product.stock > 0 ? `${product.stock} in stock` : ""}</div>
          <AddToCart item={toCartItem({ ...product, shop })} stock={product.stock} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <Store className="h-10 w-10 rounded-full bg-orange-100 p-2 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            {shop.name} <TierBadge tier={shop.tier} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {shop.rating.toFixed(1)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {shop.city}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-gray-800">Description</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line text-gray-700">{product.description}</p>
          {product.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {product.tags.map((t) => (
                <span key={t} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-gray-800">Specifications</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 pr-3 text-gray-500">Category</td>
                <td className="py-1.5 text-gray-800">{category?.label ?? product.category}</td>
              </tr>
              {attributes.map(([k, v]) => (
                <tr key={k} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 pr-3 text-gray-500 capitalize">{k.replace(/[_-]/g, " ")}</td>
                  <td className="py-1.5 text-gray-800">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
