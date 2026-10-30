// Product detail (T10): description, tags, attributes, shop box, vouchers, "Arrives by <date>" from DEMO_TODAY,
// Add to cart. Data = productDetail() (product + shop + vouchers usable by the cookie persona).
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Star, Store, Ticket, Truck, Wallet } from "lucide-react";
import { categoryById, type Voucher } from "@/contract";
import { AddToCartButton } from "@/components/store/AddToCartButton";
import { CategoryIcon } from "@/components/store/CategoryIcon";
import { TierBadge, UpdatedBadge } from "@/components/store/badges";
import { formatCount, formatShortDate, formatVnd } from "@/lib/client/format";
import { getAdapter } from "@/server/adapter";
import { productDetail } from "@/server/store";
import { addDays, today } from "@/server/today";
import { currentPersona } from "../../_lib/data";

export const dynamic = "force-dynamic";

function voucherValue(v: Voucher): string {
  if (v.kind === "percent") return `${v.value}% off${v.maxDiscount ? `, max ${formatVnd(v.maxDiscount)}` : ""}`;
  if (v.kind === "freeship") return `Free shipping up to ${formatVnd(v.value)}`;
  return `${formatVnd(v.value)} off`;
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await productDetail(getAdapter(), decodeURIComponent(id), await currentPersona());
  if (!detail) notFound();
  const { product, shop, vouchers } = detail;
  const category = categoryById(product.category);
  const now = today();
  const arrivesBy = addDays(now, product.shipDaysMax);
  const attributes = Object.entries(product.attributes);

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-xs text-gray-500">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        {category && (
          <>
            {" › "}
            <Link href={`/c/${category.id}`} className="hover:underline">
              {category.label}
            </Link>
          </>
        )}
      </nav>

      <section className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[320px_1fr] md:gap-6">
        <CategoryIcon category={product.category} className="aspect-square w-full rounded-xl md:w-80" />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TierBadge tier={shop.tier} />
            {product.updatedForDemandAt && <UpdatedBadge />}
          </div>
          <h1 className="text-xl font-semibold leading-snug">{product.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Star aria-hidden className="h-4 w-4 fill-amber-400 text-amber-400" />
              {product.rating.toFixed(1)}
            </span>
            <span>{formatCount(product.reviewCount)} reviews</span>
            <span>{formatCount(product.soldCount)} sold</span>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-2xl font-bold text-[var(--kitly-accent)]">
            {formatVnd(product.price)}
          </div>
          <div className="flex items-start gap-2 text-sm">
            <Truck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <div className="font-medium text-emerald-700">Arrives by {formatShortDate(arrivesBy)}</div>
              <div className="text-gray-500">
                Ships from {shop.city} in {product.shipDaysMin}–{product.shipDaysMax} days · shipping{" "}
                {formatVnd(shop.shipFee)}
              </div>
            </div>
          </div>
          {vouchers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-sm font-medium">Vouchers</div>
              <ul className="flex flex-wrap gap-2">
                {vouchers.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--kitly-accent)] bg-orange-50 px-2 py-1 text-xs"
                  >
                    {v.ownerPersona ? (
                      <Wallet aria-hidden className="h-3.5 w-3.5 text-[var(--kitly-accent)]" />
                    ) : (
                      <Ticket aria-hidden className="h-3.5 w-3.5 text-[var(--kitly-accent)]" />
                    )}
                    <span>
                      <span className="font-semibold">{v.code}</span> · {v.label || voucherValue(v)}
                      {v.minSpend > 0 && <> · min {formatVnd(v.minSpend)}</>}
                      {v.ownerPersona && <> · in your wallet</>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AddToCartButton product={product} shop={shop} />
        </div>
      </section>

      <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[var(--kitly-accent)]">
          <Store aria-hidden className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            {shop.name} <TierBadge tier={shop.tier} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {shop.rating.toFixed(1)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin aria-hidden className="h-3.5 w-3.5" />
              {shop.city}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Description</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{product.description}</p>
          {product.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
              {product.tags.map((t) => (
                <li key={t} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Specifications</h2>
          {attributes.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {category && (
                  <tr className="border-b border-gray-100">
                    <th className="w-1/3 py-1.5 text-left font-normal text-gray-500">Category</th>
                    <td className="py-1.5">{category.label}</td>
                  </tr>
                )}
                {attributes.map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100">
                    <th className="w-1/3 py-1.5 text-left font-normal capitalize text-gray-500">{k}</th>
                    <td className="py-1.5">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">No specifications listed.</p>
          )}
        </div>
      </section>
    </div>
  );
}
