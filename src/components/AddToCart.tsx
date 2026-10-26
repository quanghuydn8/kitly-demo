"use client";
import { useState } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import type { CartItem } from "@/lib/client/cart";
import { cartStore } from "@/lib/client/cart-store";

export function AddToCart({ item, stock }: { item: CartItem; stock: number }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  if (stock <= 0)
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-center font-medium text-gray-500">
        Out of stock
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center rounded-lg border">
        <button
          className="p-2"
          aria-label="Decrease quantity"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center" aria-label="Quantity">
          {qty}
        </span>
        <button
          className="p-2"
          aria-label="Increase quantity"
          onClick={() => setQty((q) => Math.min(stock, q + 1))}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={() => {
          cartStore.add(item, qty);
          setAdded(true);
        }}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 font-medium text-white hover:opacity-90"
      >
        {added ? <Check className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
        {added ? "Added to cart" : "Add to cart"}
      </button>
    </div>
  );
}
