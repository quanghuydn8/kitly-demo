// npm run seed — fills KITLY_DB_SCHEMA with the DATA.md world: 25 shops, ~360 products, 8 vouchers, ~1,500 demand
// sessions. Catalog text comes from the fast model (cached in scripts/.cache/, re-runs are free); planted facts and
// demand history are pure code. Idempotent: truncates ONLY the Kitly tables, then reloads, in one transaction.
import { join } from "node:path";
import type pg from "pg";
import { getLLM, models } from "@/server/llm";
import { generateCatalog } from "@/server/seed/catalog";
import { FORCED_NEEDS, generateDemand } from "@/server/seed/demand";
import { dbSchema, KITLY_TABLES } from "@/server/seed/migration";
import { SEED_SHOPS, SEED_VOUCHERS } from "@/server/seed/world";
import { fromProduct } from "@/server/adapter/supabase";
import { addDays, today } from "@/server/today";
import { connect } from "./pg";

const schema = dbSchema(process.env.KITLY_DB_SCHEMA);
const cacheDir = join(import.meta.dirname, ".cache", "catalog");

async function insertRows(client: pg.Client, table: string, rows: Record<string, unknown>[]) {
  const cols = Object.keys(rows[0]).join(", ");
  for (let i = 0; i < rows.length; i += 2000) {
    await client.query(
      `insert into ${schema}.${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::${schema}.${table}, $1::jsonb)`,
      [JSON.stringify(rows.slice(i, i + 2000))],
    );
  }
}

console.log(`generating catalog with ${models.fast()} (cache: scripts/.cache/catalog)…`);
const products = await generateCatalog({ llm: getLLM(), model: models.fast(), cacheDir, concurrency: 8 });
const demand = generateDemand({ products, today: today(), seed: 42 });

const client = await connect();
try {
  await client.query("begin");
  await client.query(
    `truncate table ${KITLY_TABLES.map((t) => `${schema}.${t}`).join(", ")} restart identity`,
  );
  await insertRows(
    client,
    "shops",
    SEED_SHOPS.map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      rating: s.rating,
      ship_fee: s.shipFee,
      city: s.city,
    })),
  );
  await insertRows(
    client,
    "products",
    products.map((p) => ({ ...fromProduct(p) })),
  );
  await insertRows(
    client,
    "vouchers",
    SEED_VOUCHERS.map((v) => ({
      id: v.id,
      scope: v.scope,
      shop_id: v.shopId,
      code: v.code,
      kind: v.kind,
      value: v.value,
      max_discount: v.maxDiscount,
      min_spend: v.minSpend,
      valid_until: v.validUntil,
    })),
  );
  await insertRows(
    client,
    "intent_sessions",
    demand.sessions.map((s) => ({
      id: s.id,
      query: s.query,
      event: s.event,
      language: s.language,
      plan: s.plan,
      source: s.source,
      created_at: s.createdAt,
    })),
  );
  await insertRows(
    client,
    "demand_items",
    demand.items.map((r) => ({
      session_id: r.sessionId,
      event: r.event,
      need_label: r.needLabel,
      category: r.category,
      tags: r.tags,
      matched_count: r.matchedCount,
      budget_hint: r.budgetHint,
      created_at: r.createdAt,
    })),
  );
  await client.query("commit");

  // ---------- summary, read back from the database ----------
  console.log(`\nseeded schema ${schema}:`);
  for (const t of KITLY_TABLES) {
    const { rows } = await client.query(`select count(*)::int as n from ${schema}.${t}`);
    console.log(`  ${t.padEnd(17)} ${rows[0].n}`);
  }
  const d = today();
  const weeks = { thisWeek: [addDays(d, -6), addDays(d, 1)], lastWeek: [addDays(d, -13), addDays(d, -6)] };
  console.log("\nforced gaps (this week / last week):");
  for (const n of FORCED_NEEDS) {
    const counts: number[] = [];
    for (const [from, to] of Object.values(weeks)) {
      const { rows } = await client.query(
        `select count(distinct session_id)::int as n from ${schema}.demand_items
         where created_at >= $1 and created_at < $2 and category is not distinct from $3 and tags = $4::text[]`,
        [from, to, n.category, n.tags],
      );
      counts.push(rows[0].n);
    }
    console.log(
      `  ${n.needLabel.padEnd(36)} ${counts[0]} / ${counts[1]}  (expected ${n.thisWeek} / ${n.lastWeek})`,
    );
  }
} catch (e) {
  await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
