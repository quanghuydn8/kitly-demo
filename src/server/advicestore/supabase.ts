// SupabaseAdviceStore: insight_advice (gap_key primary key, counts_signature, advice) in KITLY_DB_SCHEMA.
import { must, supabaseClient } from "@/server/db/supabase";
import type { AdviceStore, CachedAdvice } from "./index";

export class SupabaseAdviceStore implements AdviceStore {
  private get db() {
    return supabaseClient();
  }

  async get(gapKey: string): Promise<CachedAdvice | null> {
    const row = must<{ counts_signature: string; advice: string } | null>(
      await this.db.from("insight_advice").select("counts_signature, advice").eq("gap_key", gapKey).maybeSingle(),
      "adviceStore.get",
    );
    return row ? { countsSignature: row.counts_signature, advice: row.advice } : null;
  }

  async put(gapKey: string, countsSignature: string, advice: string): Promise<void> {
    must(
      await this.db
        .from("insight_advice")
        .upsert({ gap_key: gapKey, counts_signature: countsSignature, advice }, { onConflict: "gap_key" }),
      "adviceStore.put",
    );
  }
}
