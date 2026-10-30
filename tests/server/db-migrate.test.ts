import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMigrationSql, KITLY_TABLES, kitlySchema } from "@/server/db/migrate";

const file = fs.readFileSync("supabase/migrations/0001_init.sql", "utf8");

describe("db:migrate SQL", () => {
  it("drops only the DATA.md §6 tables (no cascade, no schema), then creates them in the schema", () => {
    const sql = buildMigrationSql([file], "kitly_full");
    expect(sql).not.toContain("__KITLY_SCHEMA__");
    expect(sql).not.toMatch(/drop schema/i);
    expect(sql).not.toMatch(/drop[^;]*cascade/i);
    expect(sql).not.toMatch(/truncate/i);
    const drops = [...sql.matchAll(/drop table if exists ([^;]+);/g)].flatMap((m) =>
      m[1].split(",").map((s) => s.trim()),
    );
    expect(drops.sort()).toEqual(KITLY_TABLES.map((t) => `kitly_full.${t}`).sort());
    expect(sql.indexOf("create schema if not exists kitly_full;")).toBeLessThan(sql.indexOf("drop table"));
    expect(sql.indexOf("drop table")).toBeLessThan(sql.indexOf("create table kitly_full.shops"));
    expect(sql).toMatch(/grant all privileges on all tables in schema kitly_full to service_role/);
  });

  it("KITLY_TABLES = DATA.md §6", () => {
    expect([...KITLY_TABLES].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it("kitlySchema(): KITLY_DB_SCHEMA validated, default public", () => {
    const prev = process.env.KITLY_DB_SCHEMA;
    try {
      delete process.env.KITLY_DB_SCHEMA;
      expect(kitlySchema()).toBe("public");
      process.env.KITLY_DB_SCHEMA = "kitly_lean";
      expect(kitlySchema()).toBe("kitly_lean");
      process.env.KITLY_DB_SCHEMA = "x; drop schema public";
      expect(() => kitlySchema()).toThrow();
      expect(() => buildMigrationSql([file], "Bad-Name")).toThrow();
    } finally {
      if (prev === undefined) delete process.env.KITLY_DB_SCHEMA;
      else process.env.KITLY_DB_SCHEMA = prev;
    }
  });
});
