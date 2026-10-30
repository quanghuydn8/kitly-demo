// The one supabase-js client (server only, service-role key), bound to KITLY_DB_SCHEMA.
// Only the Supabase implementations (adapter, kitstore, advicestore, watchstore) use it — Kitly modules never do.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { kitlySchema } from "./schema";

// Untyped rows (no generated DB types): each implementation maps rows to contract types itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KitlyDb = SupabaseClient<any, any, any>;

let cached: { key: string; client: KitlyDb } | null = null;

export function supabaseClient(): KitlyDb {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (or use KITLY_ADAPTER=memory)");
  const schema = kitlySchema();
  const id = `${url}|${schema}`;
  if (cached?.key === id) return cached.client;
  const client: KitlyDb = createClient(url, key, {
    db: { schema },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = { key: id, client };
  return client;
}

/** Throws on a PostgREST error; returns data (untyped rows unless the caller names T). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function must<T = any>(
  res: { data: unknown; error: { message: string; code?: string } | null },
  what: string,
): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** PostgREST caps a response at 1,000 rows: page with .range() until a short page. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const rows = must<T[]>(await page(from, from + size - 1), what);
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

/** Postgres timestamptz → ISO with milliseconds and Z (same format as the in-memory implementations). */
export const iso = (v: string): string => new Date(v).toISOString();
