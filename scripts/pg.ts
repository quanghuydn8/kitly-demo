// Shared Postgres connection for db:migrate / seed (SUPABASE_DB_URL). Never prints the connection string.
import pg from "pg";

export async function connect(): Promise<pg.Client> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set (see .env.example)");
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();
  console.log(`connected to Postgres at ${host}`);
  return client;
}
