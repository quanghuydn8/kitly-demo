"use client";
// DemoMart header (T10, D37): logo, search bar with Search products / Describe your need toggle (need mode is a
// plain GET form to /kit/new?q=, which starts a Kitly run), My kits, cart count, and the small Seller Centre link —
// the only buyer-side entry to the seller view. Needs <CartProvider> above it.
// T17: the persona chip (needs <PersonaProvider>; hidden without it). `inKit` = rendered above the Kitly screen.
import { useState } from "react";
import Link from "next/link";
import { Search, ShoppingBag, ShoppingCart, Sparkles } from "lucide-react";
import { useCart } from "@/lib/client/cart-store";
import { PersonaChip } from "./PersonaChip";

type Mode = "search" | "need";

const MODES: { id: Mode; label: string; action: string; placeholder: string }[] = [
  { id: "search", label: "Search products", action: "/search", placeholder: "Search DemoMart" },
  {
    id: "need",
    label: "Describe your need",
    action: "/kit/new",
    placeholder: "e.g. My son starts grade 1 on Sep 5, budget 1.5M",
  },
];

export function Header({ query = "", inKit = false }: { query?: string; inKit?: boolean }) {
  const [mode, setMode] = useState<Mode>("search");
  const { totals } = useCart();
  const current = MODES.find((m) => m.id === mode)!;
  const need = mode === "need";

  return (
    <header className="sticky top-0 z-20 bg-[var(--kitly-accent)] text-white shadow">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 sm:py-3">
        <div className="flex items-center justify-end gap-4 text-xs">
          <PersonaChip inKit={inKit} />
          <Link href="/kit" className="flex items-center gap-1 hover:underline">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            My kits
          </Link>
          <Link href="/seller" className="opacity-80 hover:underline hover:opacity-100">
            Seller Centre
          </Link>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 text-xl font-bold sm:text-2xl">
            <ShoppingBag aria-hidden className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="hidden sm:inline">DemoMart</span>
            <span className="sr-only sm:hidden">DemoMart</span>
          </Link>
          <form role="search" action={current.action} method="get" className="min-w-0 flex-1">
            <div className={`flex items-center rounded-lg bg-white p-1 ${need ? "ring-2 ring-amber-300" : ""}`}>
              <input
                type="text"
                name="q"
                required
                defaultValue={query}
                aria-label={current.label}
                placeholder={current.placeholder}
                className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-gray-900 outline-none"
              />
              <button
                type="submit"
                className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--kitly-accent)] px-3 py-1.5 text-sm font-medium"
              >
                {need ? <Sparkles aria-hidden className="h-4 w-4" /> : <Search aria-hidden className="h-4 w-4" />}
                <span className="hidden sm:inline">{need ? "Build my kit" : "Search"}</span>
              </button>
            </div>
            <div role="radiogroup" aria-label="Search mode" className="mt-1.5 flex gap-1 text-xs">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-full px-2.5 py-0.5 ${mode === m.id ? "bg-white font-medium text-[var(--kitly-accent)]" : "bg-white/15 hover:bg-white/25"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </form>
          <Link
            href="/cart"
            aria-label={`Cart, ${totals.count} items`}
            className="relative shrink-0 self-start p-1.5 sm:self-center"
          >
            <ShoppingCart aria-hidden className="h-7 w-7" />
            {totals.count > 0 && (
              <span className="absolute -right-1 -top-0.5 min-w-5 rounded-full bg-white px-1 text-center text-xs font-bold text-[var(--kitly-accent)]">
                {totals.count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
