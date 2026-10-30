// getAdapter(): the only way Kitly modules reach marketplace data. KITLY_ADAPTER = "memory" | "supabase" (default).
// One instance per server process: fine as a cache, but in-memory writes are NOT shared across Vercel instances.
import type { CommerceAdapter } from "@/contract";
import { InMemoryAdapter } from "./in-memory";
import { SupabaseAdapter } from "./supabase";

let instance: { kind: string; adapter: CommerceAdapter } | null = null;

export function adapterKind(): "memory" | "supabase" {
  return process.env.KITLY_ADAPTER === "memory" ? "memory" : "supabase";
}

export function getAdapter(): CommerceAdapter {
  const kind = adapterKind();
  if (instance?.kind !== kind) {
    instance = { kind, adapter: kind === "memory" ? new InMemoryAdapter() : new SupabaseAdapter() };
  }
  return instance.adapter;
}
