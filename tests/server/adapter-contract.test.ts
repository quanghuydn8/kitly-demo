// Runs the shared contract suite against InMemoryAdapter always, and SupabaseAdapter when SUPABASE_URL is set
// (e.g. `set -a; . ./.env; set +a; npm test` after `npm run db:migrate && npm run seed`).
import { createClient } from "@supabase/supabase-js";
import { InMemoryAdapter } from "@/server/adapter/memory";
import { SupabaseAdapter } from "@/server/adapter/supabase";
import { CONTRACT_QUERY_PREFIX, runAdapterContract } from "./adapter-contract";

runAdapterContract("InMemoryAdapter", () => new InMemoryAdapter());

if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  runAdapterContract("SupabaseAdapter", () => new SupabaseAdapter(), {
    // Remove the live sessions + advice rows this suite recorded so seeded demand counts stay exact (demand_items cascade).
    cleanup: async () => {
      const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        db: { schema: process.env.KITLY_DB_SCHEMA || "public" },
        auth: { persistSession: false },
      });
      const { error } = await db.from("intent_sessions").delete().like("query", `${CONTRACT_QUERY_PREFIX}%`);
      if (error) throw new Error(error.message);
      const advice = await db.from("insight_advice").delete().like("gap_key", `${CONTRACT_QUERY_PREFIX}%`);
      if (advice.error) throw new Error(advice.error.message);
    },
  });
}
