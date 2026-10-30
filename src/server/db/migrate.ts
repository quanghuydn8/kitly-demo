// npm run db:migrate: idempotent = create schema if missing, drop ONLY the Kitly tables (no cascade), then run
// supabase/migrations/*.sql with __KITLY_SCHEMA__ replaced. Never drops a schema or touches other tables.
import { assertSchemaName, KITLY_TABLES } from "./schema";

export { KITLY_TABLES, kitlySchema } from "./schema";

export function buildMigrationSql(files: string[], schema: string): string {
  const s = assertSchemaName(schema);
  const drop = `drop table if exists ${[...KITLY_TABLES]
    .reverse()
    .map((t) => `${s}.${t}`)
    .join(", ")};`;
  const body = files.map((f) => f.replaceAll("__KITLY_SCHEMA__", s)).join("\n");
  return `create schema if not exists ${s};\n${drop}\n${body}`;
}
