// getWatchStore(): "Notify me when available" watches (demand_watches, DATA.md §6, Full) behind the same KITLY_ADAPTER
// switch as getAdapter(). One row per watch (no buyer id in the table), so a gap's count = its number of rows.
import { adapterKind } from "@/server/adapter";
import { InMemoryWatchStore } from "./in-memory";
import { SupabaseWatchStore } from "./supabase";

export interface WatchStore {
  /** Stores one watch on the gap and returns the gap's watcher count after it. */
  add(gapKey: string): Promise<number>;
  /** Watcher count per asked key; every asked key is present (0 when nobody watches). */
  counts(gapKeys: string[]): Promise<Map<string, number>>;
}

let instance: { kind: string; store: WatchStore } | null = null;

export function getWatchStore(): WatchStore {
  const kind = adapterKind();
  if (instance?.kind !== kind) {
    instance = { kind, store: kind === "memory" ? new InMemoryWatchStore() : new SupabaseWatchStore() };
  }
  return instance.store;
}
