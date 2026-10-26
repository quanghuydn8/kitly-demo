// npm run db:migrate — applies supabase/migrations/*.sql into KITLY_DB_SCHEMA (default public).
// Idempotent: each migration drops and recreates ONLY the Kitly tables (DATA.md §6); never touches a schema or other tables.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dbSchema, renderMigration } from "@/server/seed/migration";
import { connect } from "./pg";

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
const schema = dbSchema(process.env.KITLY_DB_SCHEMA);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = await connect();
try {
  for (const f of files) {
    await client.query(renderMigration(readFileSync(join(dir, f), "utf8"), schema));
    console.log(`applied ${f} → schema ${schema}`);
  }
} finally {
  await client.end();
}
