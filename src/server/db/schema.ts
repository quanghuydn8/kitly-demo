// KITLY_DB_SCHEMA (default public): the Postgres schema of every Kitly table, used by SQL and supabase-js alike.
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

export function assertSchemaName(name: string): string {
  if (!IDENT.test(name)) throw new Error(`invalid KITLY_DB_SCHEMA "${name}" (lowercase letters, digits, _)`);
  return name;
}

export function kitlySchema(): string {
  return assertSchemaName(process.env.KITLY_DB_SCHEMA?.trim() || "public");
}

/** The only tables Kitly may create/alter/drop/truncate (DATA.md §6). The database may be shared. */
export const KITLY_TABLES = [
  "shops",
  "products",
  "product_versions",
  "vouchers",
  "personas",
  "intent_sessions",
  "demand_items",
  "insight_advice",
  "demand_watches",
  "kit_threads",
  "kit_versions",
  "kit_messages",
] as const;
