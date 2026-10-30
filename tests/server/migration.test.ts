import fs from "node:fs";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync("supabase/migrations/0001_init.sql", "utf8");
const KITLY_TABLES = [
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
];

describe("supabase/migrations/0001_init.sql", () => {
  it("creates exactly the DATA.md §6 tables, all inside the Kitly schema", () => {
    const created = [...sql.matchAll(/create table (\S+) \(/g)].map((m) => m[1]);
    expect(created).toEqual(KITLY_TABLES.map((t) => `__KITLY_SCHEMA__.${t}`));
    expect(sql).not.toMatch(/references (?!__KITLY_SCHEMA__\.)/);
    expect(sql).not.toMatch(/create index \S+ on (?!__KITLY_SCHEMA__\.)/);
  });

  it("starts with create schema, grants to service_role, never drops a schema", () => {
    expect(sql).toMatch(/^(--.*\n)*create schema if not exists __KITLY_SCHEMA__;/);
    expect(sql).toMatch(/grant usage on schema __KITLY_SCHEMA__ to service_role/);
    expect(sql).toMatch(/grant all privileges on all tables in schema __KITLY_SCHEMA__ to service_role/);
    expect(sql).toMatch(/grant all privileges on all sequences in schema __KITLY_SCHEMA__ to service_role/);
    expect(sql).not.toMatch(/drop schema/i);
  });
});
