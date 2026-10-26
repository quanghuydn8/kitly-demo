import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KITLY_TABLES, renderMigration } from "@/server/seed/migration";

const SQL = readFileSync("supabase/migrations/0001_init.sql", "utf8");

describe("renderMigration", () => {
  it("targets KITLY_DB_SCHEMA and drops only Kitly tables before creating them", () => {
    const out = renderMigration(SQL, "kitly_full");
    expect(out).not.toContain("kitly_schema");
    expect(out).toContain("create schema if not exists kitly_full;");
    expect(out).toContain("grant all privileges on all tables in schema kitly_full to service_role;");
    expect(out.toLowerCase()).not.toMatch(/drop\s+schema/);
    const dropped = [...out.matchAll(/drop table if exists ([a-z_.]+)/gi)].map((m) =>
      m[1].replace("kitly_full.", ""),
    );
    expect(new Set(dropped)).toEqual(new Set(KITLY_TABLES));
    expect(out.indexOf("drop table if exists")).toBeLessThan(out.indexOf("create table"));
    expect(out).not.toMatch(/(drop|truncate)[^;]*cascade/i);
  });

  it("lists exactly the 8 DATA.md §6 tables", () => {
    expect([...KITLY_TABLES].sort()).toEqual([
      "demand_items",
      "demand_watches",
      "insight_advice",
      "intent_sessions",
      "product_versions",
      "products",
      "shops",
      "vouchers",
    ]);
  });

  it("defaults to public and rejects unsafe schema names", () => {
    expect(renderMigration(SQL, "")).toContain("create schema if not exists public;");
    for (const bad of ["x; drop table y", "Kitly", "a-b", "1abc"])
      expect(() => renderMigration(SQL, bad)).toThrow();
  });
});
