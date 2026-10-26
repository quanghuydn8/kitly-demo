"use client";
// Store header: DemoMart logo, search bar with mode toggle (products → /search, need → /kit), cart with count.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, ShoppingBag, ShoppingCart, Sparkles } from "lucide-react";
import { cartCount } from "@/lib/client/cart";
import { useCart } from "@/lib/client/cart-store";

type Mode = "products" | "need";

export function Header({ initialMode = "products" }: { initialMode?: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [q, setQ] = useState(params.get("q") ?? "");
  const count = cartCount(useCart());

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    router.push(`${mode === "need" ? "/kit" : "/search"}?q=${encodeURIComponent(text)}`);
  }

  return (
    <header className="sticky top-0 z-20 bg-[var(--accent)] text-white shadow">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-1.5 text-xl font-bold tracking-tight">
          <ShoppingBag className="h-6 w-6" /> DemoMart
        </Link>
        <Link
          href="/cart"
          className="relative order-2 ml-auto p-1 sm:order-3"
          aria-label={`Cart, ${count} items`}
        >
          <ShoppingCart className="h-6 w-6" />
          {count > 0 && (
            <span
              data-testid="cart-count"
              className="absolute -top-1 -right-2 min-w-5 rounded-full bg-white px-1 text-center text-xs font-bold text-[var(--accent)]"
            >
              {count}
            </span>
          )}
        </Link>
        <form onSubmit={submit} className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1" role="search">
          <div className="flex rounded-lg bg-white p-1 text-gray-800">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                mode === "need"
                  ? "Describe your need, e.g. My kid starts Grade 1, budget 1.5M…"
                  : "Search products"
              }
              aria-label={mode === "need" ? "Describe your need" : "Search products"}
              className="min-w-0 flex-1 px-2 text-sm outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
              aria-label={mode === "need" ? "Build my kit" : "Search"}
            >
              {mode === "need" ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              <span className="hidden sm:inline">{mode === "need" ? "Build kit" : "Search"}</span>
            </button>
          </div>
          <div className="mt-1.5 flex gap-1 text-xs" role="radiogroup" aria-label="Search mode">
            {(
              [
                ["products", "Search products"],
                ["need", "Describe your need"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 ${
                  mode === m ? "bg-white font-semibold text-[var(--accent)]" : "bg-white/15 hover:bg-white/25"
                }`}
              >
                {m === "need" && <Sparkles className="h-3 w-3" />}
                {label}
              </button>
            ))}
          </div>
        </form>
      </div>
    </header>
  );
}
