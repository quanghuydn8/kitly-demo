"use client";
// Cart React state + localStorage persistence (per-browser convenience; checkout re-prices on the server).
// Wrap any page that shows the cart count or adds to cart in <CartProvider>; state survives route changes
// and reloads through localStorage key CART_KEY.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { addToCart, cartTotals, setQuantity, type CartLine, type CartTotals } from "./cart";

export const CART_KEY = "demomart_cart_v1";

interface CartState {
  lines: CartLine[];
  totals: CartTotals;
  /** false until localStorage was read (avoid flashing "empty" on first paint). */
  ready: boolean;
  add(line: CartLine): void;
  setQty(productId: string, quantity: number): void;
  clear(): void;
}

const CartContext = createContext<CartState | null>(null);

function load(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

function save(lines: CartLine[]): void {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    // storage blocked (private mode): the cart still works for this page view
  }
}

/** initialLines (tests) skips the localStorage read. */
export function CartProvider({ children, initialLines }: { children: ReactNode; initialLines?: CartLine[] }) {
  const [lines, setLines] = useState<CartLine[]>(initialLines ?? []);
  const [ready, setReady] = useState(initialLines !== undefined);

  useEffect(() => {
    if (initialLines !== undefined) return;
    setLines(load());
    setReady(true);
    // initialLines is a one-time seed, intentionally not a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((next: (prev: CartLine[]) => CartLine[]) => {
    setLines((prev) => {
      const out = next(prev);
      save(out);
      return out;
    });
  }, []);

  const value = useMemo<CartState>(
    () => ({
      lines,
      totals: cartTotals(lines),
      ready,
      add: (line) => update((prev) => addToCart(prev, line)),
      setQty: (productId, quantity) => update((prev) => setQuantity(prev, productId, quantity)),
      clear: () => update(() => []),
    }),
    [lines, ready, update],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
