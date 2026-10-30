// getKitStore(): same KITLY_ADAPTER switch as getAdapter().
import type { KitStore } from "@/contract";
import { adapterKind } from "@/server/adapter";
import { InMemoryKitStore } from "./in-memory";
import { SupabaseKitStore } from "./supabase";

let instance: { kind: string; store: KitStore } | null = null;

export function getKitStore(): KitStore {
  const kind = adapterKind();
  if (instance?.kind !== kind) {
    instance = { kind, store: kind === "memory" ? new InMemoryKitStore() : new SupabaseKitStore() };
  }
  return instance.store;
}
