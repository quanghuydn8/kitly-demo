// getAdapter(): the single factory Kitly modules use to reach marketplace data (KITLY_ADAPTER=memory|supabase).
import type { CommerceAdapter } from "@/contract/types";
import { InMemoryAdapter } from "./memory";
import { SupabaseAdapter } from "./supabase";

let instance: CommerceAdapter | null = null;

export function getAdapter(): CommerceAdapter {
  if (instance) return instance;
  const kind = process.env.KITLY_ADAPTER ?? "supabase";
  if (kind === "memory") instance = new InMemoryAdapter();
  else if (kind === "supabase") instance = new SupabaseAdapter();
  else throw new Error(`unknown KITLY_ADAPTER: ${kind}`);
  return instance;
}

/** Tests only: drop the cached instance so the next getAdapter() starts from fresh fixtures. */
export function resetAdapterForTests(): void {
  instance = null;
}
