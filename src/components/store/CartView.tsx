"use client";
// Cart page body (T10): lines grouped by shop, shipping per shop, totals, checkout → POST /api/checkout →
// /checkout/confirmation. The server total is authoritative and is what the confirmation page shows.
import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Store, Trash2 } from "lucide-react";
import type { CheckoutRequest } from "@/contract";
import { useCart } from "@/lib/client/cart-store";
import { formatVnd } from "@/lib/client/format";
import { CategoryIcon } from "./CategoryIcon";
import { TierBadge } from "./badges";

export function CartView() {
  const { totals, ready, setQty, clear } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <p className="py-16 text-center text-gray-400">Loading cart…</p>;

  if (totals.shops.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-16 text-center">
        <ShoppingCart aria-hidden className="h-12 w-12 text-gray-300" />
        <p className="text-gray-600">Your cart is empty</p>
        <Link href="/" className="rounded-lg bg-[var(--kitly-accent)] px-4 py-2 text-sm font-medium text-white">
          Continue shopping
        </Link>
      </div>
    );
  }

  async function checkout() {
    setBusy(true);
    setError(null);
    const body: CheckoutRequest = {
      lines: totals.shops.flatMap((g) => g.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))),
    };
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { orderId?: string; grandTotal?: number; error?: { message: string } };
      if (!res.ok || !data.orderId) throw new Error(data.error?.message ?? `Checkout failed (${res.status})`);
      clear();
      const qs = new URLSearchParams({ order: data.orderId, total: String(data.grandTotal ?? 0) });
      window.location.assign(`/checkout/confirmation?${qs}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-3">
        {totals.shops.map((g) => (
          <section
            key={g.shop.id}
            aria-label={g.shop.name}
            className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4"
          >
            <header className="mb-2 flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-medium">
              <Store aria-hidden className="h-4 w-4 text-gray-500" />
              <span>{g.shop.name}</span>
              <TierBadge tier={g.shop.tier} />
            </header>
            <ul className="divide-y divide-gray-50">
              {g.lines.map((l) => (
                <li key={l.productId} className="flex items-center gap-3 py-2">
                  <CategoryIcon category={l.category} className="h-14 w-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/p/${l.productId}`} className="line-clamp-2 text-sm text-gray-800 hover:underline">
                      {l.title}
                    </Link>
                    <div className="text-sm text-[var(--kitly-accent)]">{formatVnd(l.price)}</div>
                  </div>
                  <div className="flex items-center rounded-lg border border-gray-200">
                    <button
                      type="button"
                      aria-label={`Decrease ${l.title}`}
                      className="p-1.5 text-gray-600 disabled:opacity-30"
                      disabled={l.quantity <= 1}
                      onClick={() => setQty(l.productId, l.quantity - 1)}
                    >
                      <Minus aria-hidden className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm tabular-nums">{l.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${l.title}`}
                      className="p-1.5 text-gray-600"
                      onClick={() => setQty(l.productId, l.quantity + 1)}
                    >
                      <Plus aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${l.title}`}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                    onClick={() => setQty(l.productId, 0)}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <dl className="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <dt>Subtotal</dt>
                <dd>{formatVnd(g.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>Shipping</dt>
                <dd>{formatVnd(g.shipping)}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <aside
        data-testid="cart-summary"
        className="h-fit rounded-xl border border-gray-100 bg-white p-4 shadow-sm lg:sticky lg:top-24"
      >
        <h2 className="mb-3 font-semibold">Order summary</h2>
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <dt>Items ({totals.count})</dt>
            <dd>{formatVnd(totals.itemsTotal)}</dd>
          </div>
          <div className="flex justify-between text-gray-600">
            <dt>Shipping ({totals.shops.length} shops)</dt>
            <dd>{formatVnd(totals.shippingTotal)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="text-[var(--kitly-accent)]">{formatVnd(totals.grandTotal)}</dd>
          </div>
        </dl>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={checkout}
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-[var(--kitly-accent)] py-2.5 font-medium text-white disabled:opacity-60"
        >
          {busy ? "Placing order…" : "Check out"}
        </button>
      </aside>
    </div>
  );
}
