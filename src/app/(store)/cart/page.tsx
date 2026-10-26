"use client";
// Cart grouped by shop (one shipping fee per shop) → POST /api/checkout → confirmation page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Minus, Plus, ShoppingCart, Store, Trash2 } from "lucide-react";
import type { ApiError, CheckoutResponse } from "@/contract/types";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cartSummary } from "@/lib/client/cart";
import { cartStore, useCart } from "@/lib/client/cart-store";
import { formatVnd } from "@/lib/client/format";

export default function CartPage() {
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = cartSummary(cart);

  async function placeOrder() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })) }),
      });
      const body = (await res.json()) as CheckoutResponse | ApiError;
      if (!res.ok || "error" in body)
        throw new Error("error" in body ? body.error.message : `HTTP ${res.status}`);
      cartStore.clear();
      router.push(`/checkout/success?orderId=${encodeURIComponent(body.orderId)}&total=${body.grandTotal}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setBusy(false);
    }
  }

  if (cart.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 text-center shadow-sm">
        <ShoppingCart className="h-12 w-12 text-gray-300" />
        <div className="text-gray-600">Your cart is empty.</div>
        <Link href="/" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
          Continue shopping
        </Link>
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <h1 className="text-lg font-semibold text-gray-800">Cart ({cart.length})</h1>
        {s.groups.map((g) => (
          <section key={g.shopId} className="rounded-2xl bg-white shadow-sm" data-testid="cart-shop">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 font-medium text-gray-800">
              <Store className="h-4 w-4 text-[var(--accent)]" /> {g.shopName}
            </div>
            <ul className="divide-y divide-gray-100">
              {g.lines.map((l) => (
                <li key={l.productId} className="flex items-center gap-3 px-4 py-3">
                  <CategoryIcon
                    category={l.category}
                    className="h-14 w-14 shrink-0"
                    iconClassName="h-6 w-6"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${l.productId}`}
                      className="line-clamp-2 text-sm text-gray-800 hover:underline"
                    >
                      {l.title}
                    </Link>
                    <div className="text-sm text-[var(--accent)]">{formatVnd(l.price)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex items-center rounded border">
                        <button
                          className="p-1"
                          aria-label="Decrease quantity"
                          onClick={() => cartStore.setQuantity(l.productId, l.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center text-sm">{l.quantity}</span>
                        <button
                          className="p-1"
                          aria-label="Increase quantity"
                          onClick={() => cartStore.setQuantity(l.productId, l.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        className="p-1 text-gray-400 hover:text-red-500"
                        aria-label="Remove"
                        onClick={() => cartStore.setQuantity(l.productId, 0)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium whitespace-nowrap text-gray-800">
                    {formatVnd(l.price * l.quantity)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-600">
              <span>Shipping from {g.shopName}</span>
              <span>{formatVnd(g.shipping)}</span>
            </div>
            <div className="flex justify-between px-4 pb-3 text-sm font-medium text-gray-800">
              <span>Shop total</span>
              <span>{formatVnd(g.subtotal + g.shipping)}</span>
            </div>
          </section>
        ))}
      </div>

      <aside className="h-fit space-y-2 rounded-2xl bg-white p-4 shadow-sm lg:sticky lg:top-28">
        <h2 className="font-semibold text-gray-800">Order summary</h2>
        <Row label="Items" value={s.itemsTotal} />
        <Row
          label={`Shipping (${s.groups.length} shop${s.groups.length === 1 ? "" : "s"})`}
          value={s.shippingTotal}
        />
        <div className="flex justify-between border-t border-gray-100 pt-2 text-lg font-bold">
          <span>Total</span>
          <span className="text-[var(--accent)]" data-testid="cart-grand-total">
            {formatVnd(s.grandTotal)}
          </span>
        </div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          onClick={placeOrder}
          disabled={busy}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-medium text-white disabled:opacity-60"
        >
          {busy ? "Placing order…" : "Checkout"}
        </button>
        <p className="text-xs text-gray-400">Demo store: no payment is taken.</p>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm text-gray-600">
      <span>{label}</span>
      <span>{formatVnd(value)}</span>
    </div>
  );
}
