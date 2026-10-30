// npm run db:migrate — applies supabase/migrations/*.sql to KITLY_DB_SCHEMA (drop + create of Kitly tables only).
import fs from "node:fs";
import path from "node:path";
import { buildMigrationSql, kitlySchema } from "@/server/db/migrate";
import { connectPg } from "@/server/db/pg";

const dir = path.resolve("supabase/migrations");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const schema = kitlySchema();
const sql = buildMigrationSql(
  files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")),
  schema,
);

const client = await connectPg();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = $1 order by 1",
    [schema],
  );
  console.log(
    `db:migrate: applied ${files.join(", ")} to schema ${schema}: ${rows.map((r) => r.table_name).join(", ")}`,
  );
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
