"use client";
// Product detail "Add to cart" with a quantity stepper; adds a CartLine snapshot to the client cart.
import { useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import type { Product, Shop } from "@/contract";
import { useCart } from "@/lib/client/cart-store";

export function AddToCartButton({ product, shop }: { product: Product; shop: Shop }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const soldOut = product.stock < 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span>Quantity</span>
        <div className="flex items-center rounded-lg border border-gray-200">
          <button
            type="button"
            aria-label="Decrease quantity"
            className="p-2 disabled:opacity-30"
            disabled={qty <= 1}
            onClick={() => setQty(qty - 1)}
          >
            <Minus aria-hidden className="h-4 w-4" />
          </button>
          <span className="w-8 text-center tabular-nums">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            className="p-2 disabled:opacity-30"
            disabled={qty >= product.stock}
            onClick={() => setQty(qty + 1)}
          >
            <Plus aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <span>{product.stock} in stock</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={soldOut}
          onClick={() => {
            add({
              productId: product.id,
              title: product.title,
              category: product.category,
              price: product.price,
              quantity: qty,
              shop,
            });
            setAdded(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-[var(--kitly-accent)] px-5 py-2.5 font-medium text-white disabled:opacity-50"
        >
          <ShoppingCart aria-hidden className="h-5 w-5" />
          {soldOut ? "Sold out" : "Add to cart"}
        </button>
        {added && (
          <span role="status" className="flex items-center gap-1 text-sm text-emerald-700">
            <Check aria-hidden className="h-4 w-4" />
            Added ·{" "}
            <Link href="/cart" className="underline">
              View cart
            </Link>
          </span>
        )}
      </div>
    </div>
  );
}
