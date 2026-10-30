// SupabaseWatchStore: demand_watches (id, gap_key, created_at) in KITLY_DB_SCHEMA. Insert-only; counts are row counts.
import { fetchAll, must, supabaseClient } from "@/server/db/supabase";
import type { WatchStore } from "./index";

export class SupabaseWatchStore implements WatchStore {
  private get db() {
    return supabaseClient();
  }

  async add(gapKey: string): Promise<number> {
    must(await this.db.from("demand_watches").insert({ gap_key: gapKey }), "watchStore.add");
    const { count, error } = await this.db
      .from("demand_watches")
      .select("id", { count: "exact", head: true })
      .eq("gap_key", gapKey);
    if (error) throw new Error(`watchStore.add count: ${error.message}`);
    return count ?? 0;
  }

  async counts(gapKeys: string[]): Promise<Map<string, number>> {
    const out = new Map(gapKeys.map((k) => [k, 0]));
    if (!gapKeys.length) return out;
    const rows = await fetchAll<{ gap_key: string }>(
      (from, to) => this.db.from("demand_watches").select("gap_key").in("gap_key", gapKeys).order("id").range(from, to),
      "watchStore.counts",
    );
    for (const r of rows) out.set(r.gap_key, (out.get(r.gap_key) ?? 0) + 1);
    return out;
  }
}
