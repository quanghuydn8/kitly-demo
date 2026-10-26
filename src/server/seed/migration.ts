// db:migrate helpers: the migration SQL uses the placeholder schema `kitly_schema`; we render it for KITLY_DB_SCHEMA.
// Only the DATA.md §6 tables are ever dropped/truncated — the database may be shared with other apps.

export const KITLY_TABLES = [
  "shops",
  "products",
  "product_versions",
  "vouchers",
  "intent_sessions",
  "demand_items",
  "insight_advice",
  "demand_watches",
] as const;

const PLACEHOLDER = /\bkitly_schema\b/g;

/** Validated KITLY_DB_SCHEMA (default `public`); throws on anything that is not a plain lower-case identifier. */
export function dbSchema(raw: string | undefined): string {
  const s = (raw ?? "").trim() || "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`invalid KITLY_DB_SCHEMA: ${JSON.stringify(s)}`);
  return s;
}

export function renderMigration(sql: string, schema: string): string {
  return sql.replace(PLACEHOLDER, dbSchema(schema));
}
