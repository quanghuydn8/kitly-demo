"use client";
// Browser cart store: module singleton persisted to localStorage, read via useSyncExternalStore (no provider needed).
// Kitly (ticket 11) adds a whole kit with `cartStore.addMany(...)`.
import { useSyncExternalStore } from "react";
import { addToCart, setQuantity, type CartItem, type CartLine } from "./cart";

const KEY = "demomart.cart.v1";
const EMPTY: CartLine[] = [];
let lines: CartLine[] | null = null; // null = not loaded yet
const listeners = new Set<() => void>();

function load(): CartLine[] {
  if (lines) return lines;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    lines = Array.isArray(parsed) ? parsed : [];
  } catch {
    lines = [];
  }
  return lines!;
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked (private mode): keep in memory only
  }
  listeners.forEach((l) => l());
}

export const cartStore = {
  get: load,
  add: (item: CartItem, quantity = 1) => commit(addToCart(load(), item, quantity)),
  addMany: (items: { item: CartItem; quantity: number }[]) =>
    commit(items.reduce((c, { item, quantity }) => addToCart(c, item, quantity), load())),
  setQuantity: (productId: string, quantity: number) => commit(setQuantity(load(), productId, quantity)),
  clear: () => commit([]),
  subscribe(l: () => void) {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        lines = null; // another tab changed it
        l();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  },
};

/** Current cart lines; [] during SSR / first hydration render. */
export function useCart(): CartLine[] {
  return useSyncExternalStore(cartStore.subscribe, cartStore.get, () => EMPTY);
}
