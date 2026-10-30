// Writes a built World to Postgres: truncate ONLY the Kitly tables, then bulk insert, in one transaction.
import type pg from "pg";
import { KITLY_TABLES } from "@/server/db/schema";
import { addDays } from "@/server/today";
import type { World } from "./world";
import { FORCED_NEEDS } from "./demand";

type Row = unknown[];

async function insert(client: pg.Client, table: string, cols: string[], rows: Row[], chunk = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values = part.map((r, j) => `(${r.map((_, k) => `$${j * cols.length + k + 1}`).join(", ")})`).join(", ");
    await client.query(`insert into ${table} (${cols.join(", ")}) values ${values}`, part.flat());
  }
}

export async function writeWorld(client: pg.Client, schema: string, w: World): Promise<void> {
  const t = (name: string) => `${schema}.${name}`;
  await client.query("begin");
  try {
    await client.query(`truncate table ${KITLY_TABLES.map(t).join(", ")} restart identity`);
    await insert(
      client,
      t("shops"),
      ["id", "name", "tier", "rating", "ship_fee", "city"],
      w.shops.map((s) => [s.id, s.name, s.tier, s.rating, s.shipFee, s.city]),
    );
    await insert(
      client,
      t("products"),
      [
        "id",
        "shop_id",
        "title",
        "category",
        "description",
        "price",
        "rating",
        "review_count",
        "sold_count",
        "stock",
        "tags",
        "attributes",
        "ship_days_min",
        "ship_days_max",
        "updated_for_demand_at",
      ],
      w.products.map((p) => [
        p.id,
        p.shopId,
        p.title,
        p.category,
        p.description,
        p.price,
        p.rating,
        p.reviewCount,
        p.soldCount,
        p.stock,
        p.tags,
        JSON.stringify(p.attributes),
        p.shipDaysMin,
        p.shipDaysMax,
        p.updatedForDemandAt,
      ]),
    );
    await insert(
      client,
      t("vouchers"),
      [
        "id",
        "scope",
        "shop_id",
        "code",
        "kind",
        "value",
        "max_discount",
        "min_spend",
        "valid_until",
        "owner_persona",
        "label",
      ],
      w.vouchers.map((v) => [
        v.id,
        v.scope,
        v.shopId,
        v.code,
        v.kind,
        v.value,
        v.maxDiscount,
        v.minSpend,
        v.validUntil,
        v.ownerPersona,
        v.label,
      ]),
    );
    await insert(
      client,
      t("personas"),
      ["id", "name", "district", "city", "favorite_shop_ids", "cart"],
      w.personas.map((p) => [
        p.id,
        p.name,
        p.address?.district ?? null,
        p.address?.city ?? null,
        p.favoriteShopIds,
        JSON.stringify(p.cart),
      ]),
    );
    await insert(
      client,
      t("intent_sessions"),
      ["id", "query", "event", "language", "plan", "source", "created_at"],
      w.sessions.map((s) => [s.id, s.query, s.event, s.language, JSON.stringify(s.plan), s.source, s.createdAt]),
    );
    await insert(
      client,
      t("demand_items"),
      ["session_id", "event", "need_label", "category", "tags", "matched_count", "budget_hint", "created_at"],
      w.sessions.flatMap((s) =>
        s.items.map((i) => [s.id, s.event, i.needLabel, i.category, i.tags, i.matchedCount, i.budgetHint, s.createdAt]),
      ),
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

/** Counts per table + forced-gap distinct sessions, read back from the database. */
export async function seedSummary(client: pg.Client, schema: string, today: string): Promise<string> {
  const lines: string[] = [];
  for (const name of KITLY_TABLES) {
    const { rows } = await client.query(`select count(*)::int as n from ${schema}.${name}`);
    lines.push(`  ${name.padEnd(17)} ${rows[0].n}`);
  }
  const weeks = {
    thisWeek: [addDays(today, -6), addDays(today, 1)],
    lastWeek: [addDays(today, -13), addDays(today, -6)],
  };
  lines.push("  forced gaps (distinct sessions: this week / last week):");
  for (const f of FORCED_NEEDS) {
    const counts: number[] = [];
    for (const [from, to] of Object.values(weeks)) {
      const cond = f.category === null ? "category is null" : "category = $3 and tags = $4::text[]";
      const params = f.category === null ? [from, to] : [from, to, f.category, f.tags];
      const { rows } = await client.query(
        `select count(distinct session_id)::int as n from ${schema}.demand_items
         where created_at >= $1::date and created_at < $2::date and ${cond}`,
        params,
      );
      counts.push(rows[0].n);
    }
    lines.push(
      `    ${(f.category ?? "none (pet items)").padEnd(16)} ${f.tags.join(",").padEnd(16)} ${counts[0]} / ${counts[1]}`,
    );
  }
  return lines.join("\n");
}
