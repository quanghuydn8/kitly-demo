// Direct Postgres connection (SUPABASE_DB_URL): used ONLY by scripts (db:migrate, seed). The app uses supabase-js.
import pg from "pg";

export async function connectPg(): Promise<pg.Client> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set (see .env.example)");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  return client;
}
