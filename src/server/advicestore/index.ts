// getAdviceStore(): the insight_advice cache (DATA.md §6) behind the same KITLY_ADAPTER switch as getAdapter().
// Seller advice is cached by gap key + counts signature, so it survives across Vercel instances in Supabase.
import { adapterKind } from "@/server/adapter";
import { InMemoryAdviceStore } from "./in-memory";
import { SupabaseAdviceStore } from "./supabase";

export interface CachedAdvice {
  countsSignature: string;
  advice: string;
}

export interface AdviceStore {
  get(gapKey: string): Promise<CachedAdvice | null>;
  /** Upsert: one row per gap key. */
  put(gapKey: string, countsSignature: string, advice: string): Promise<void>;
}

let instance: { kind: string; store: AdviceStore } | null = null;

export function getAdviceStore(): AdviceStore {
  const kind = adapterKind();
  if (instance?.kind !== kind) {
    instance = { kind, store: kind === "memory" ? new InMemoryAdviceStore() : new SupabaseAdviceStore() };
  }
  return instance.store;
}
