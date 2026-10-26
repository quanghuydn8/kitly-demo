// SupabaseAdapter: the production CommerceAdapter (KITLY_ADAPTER=supabase). Server-only — uses the service-role key.
// Every query runs in KITLY_DB_SCHEMA. PostgREST caps responses at 1,000 rows, so list reads page through `range`.
import { createClient } from "@supabase/supabase-js";
import type {
  CommerceAdapter,
  DemandItemRow,
  KitPlan,
  PlanItem,
  Product,
  ProductQuery,
  Shop,
  Voucher,
} from "@/contract/types";
import { todayIso } from "@/server/today";
import { dbSchema } from "@/server/seed/migration";

const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProductRow {
  id: string;
  shop_id: string;
  title: string;
  category: string;
  description: string;
  price: number;
  rating: number | string;
  review_count: number;
  sold_count: number;
  stock: number;
  tags: string[];
  attributes: Record<string, string>;
  ship_days_min: number;
  ship_days_max: number;
  updated_for_demand_at: string | null;
}

const iso = (ts: string | null) => (ts === null ? null : new Date(ts).toISOString());

export const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  shopId: r.shop_id,
  title: r.title,
  category: r.category,
  description: r.description,
  price: r.price,
  rating: Number(r.rating),
  reviewCount: r.review_count,
  soldCount: r.sold_count,
  stock: r.stock,
  tags: r.tags ?? [],
  attributes: r.attributes ?? {},
  shipDaysMin: r.ship_days_min,
  shipDaysMax: r.ship_days_max,
  updatedForDemandAt: iso(r.updated_for_demand_at),
});

export const fromProduct = (p: Product): ProductRow => ({
  id: p.id,
  shop_id: p.shopId,
  title: p.title,
  category: p.category,
  description: p.description,
  price: p.price,
  rating: p.rating,
  review_count: p.reviewCount,
  sold_count: p.soldCount,
  stock: p.stock,
  tags: p.tags,
  attributes: p.attributes,
  ship_days_min: p.shipDaysMin,
  ship_days_max: p.shipDaysMax,
  updated_for_demand_at: p.updatedForDemandAt,
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`supabase ${what}: ${res.error.message}`);
  return res.data;
}

/** Words usable inside a PostgREST or() filter: letters, digits and dashes only. */
const searchWords = (text: string) =>
  text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter(Boolean);

const makeClient = (url: string, key: string, schema: string) =>
  createClient(url, key, { db: { schema }, auth: { persistSession: false, autoRefreshToken: false } });

export class SupabaseAdapter implements CommerceAdapter {
  private db: ReturnType<typeof makeClient>;

  constructor(opts?: { url?: string; serviceRoleKey?: string; schema?: string }) {
    const url = opts?.url ?? process.env.SUPABASE_URL;
    const key = opts?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SupabaseAdapter needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    this.db = makeClient(url, key, dbSchema(opts?.schema ?? process.env.KITLY_DB_SCHEMA));
  }

  /** Pages through a query builder factory until fewer than PAGE rows come back (or `limit` is reached). */
  private async all<T>(
    query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    what: string,
    limit = Infinity,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; out.length < limit; from += PAGE) {
      const to = from + Math.min(PAGE, limit - out.length) - 1;
      const rows = check(await query(from, to), what) ?? [];
      out.push(...rows);
      if (rows.length < to - from + 1) break;
    }
    return out;
  }

  async listShops(): Promise<Shop[]> {
    const rows = await this.all<{
      id: string;
      name: string;
      tier: Shop["tier"];
      rating: number | string;
      ship_fee: number;
      city: string;
    }>((f, t) => this.db.from("shops").select("*").order("id").range(f, t), "listShops");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      tier: r.tier,
      rating: Number(r.rating),
      shipFee: r.ship_fee,
      city: r.city,
    }));
  }

  async getProduct(id: string): Promise<Product | null> {
    const row = check(await this.db.from("products").select("*").eq("id", id).maybeSingle(), "getProduct");
    return row ? toProduct(row as ProductRow) : null;
  }

  async searchProducts(q: ProductQuery): Promise<Product[]> {
    const rows = await this.all<ProductRow>(
      (f, t) => {
        let b = this.db.from("products").select("*");
        if (q.category) b = b.eq("category", q.category);
        if (q.maxPrice != null) b = b.lte("price", q.maxPrice);
        if (q.tagsAny?.length) b = b.overlaps("tags", q.tagsAny);
        // Every word must appear in title, description or tags (same rule as InMemoryAdapter).
        for (const w of searchWords(q.text ?? ""))
          b = b.or(`title.ilike.*${w}*,description.ilike.*${w}*,tags.cs.{${w}}`);
        return b.order("id").range(f, t);
      },
      "searchProducts",
      q.limit ?? Infinity,
    );
    return rows.map(toProduct);
  }

  async listVouchers(): Promise<Voucher[]> {
    const rows = await this.all<{
      id: string;
      scope: Voucher["scope"];
      shop_id: string | null;
      code: string;
      kind: Voucher["kind"];
      value: number;
      max_discount: number | null;
      min_spend: number;
      valid_until: string;
    }>((f, t) => this.db.from("vouchers").select("*").order("id").range(f, t), "listVouchers");
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      shopId: r.shop_id,
      code: r.code,
      kind: r.kind,
      value: r.value,
      maxDiscount: r.max_discount,
      minSpend: r.min_spend,
      validUntil: r.valid_until,
    }));
  }

  async recordIntent(s: {
    query: string;
    plan: KitPlan;
    source: "live" | "seed";
  }): Promise<{ sessionId: string }> {
    const row = check(
      await this.db
        .from("intent_sessions")
        .insert({
          query: s.query,
          event: s.plan.event,
          language: s.plan.language,
          plan: s.plan,
          source: s.source,
          created_at: todayIso(),
        })
        .select("id")
        .single(),
      "recordIntent",
    );
    return { sessionId: (row as { id: string }).id };
  }

  async getIntentSession(
    sessionId: string,
  ): Promise<{ sessionId: string; query: string; plan: KitPlan } | null> {
    // id is a uuid column: a malformed id would be a Postgres cast error, so it is simply "not found".
    if (!UUID.test(sessionId)) return null;
    const row = check(
      await this.db.from("intent_sessions").select("query, plan").eq("id", sessionId).maybeSingle(),
      "getIntentSession",
    ) as { query: string; plan: KitPlan } | null;
    return row ? { sessionId, query: row.query, plan: row.plan } : null;
  }

  async recordDemandItems(
    sessionId: string,
    items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[],
  ): Promise<void> {
    const session = check(
      await this.db.from("intent_sessions").select("event, created_at").eq("id", sessionId).maybeSingle(),
      "recordDemandItems",
    ) as { event: string; created_at: string } | null;
    if (!session) throw new Error(`unknown session ${sessionId}`);
    if (items.length === 0) return;
    check(
      await this.db.from("demand_items").insert(
        items.map(({ item, matchedCount, budgetHint }) => ({
          session_id: sessionId,
          event: session.event,
          need_label: item.needLabel,
          category: item.category,
          tags: item.mustHaveTags,
          matched_count: matchedCount,
          budget_hint: budgetHint,
          created_at: session.created_at,
        })),
      ),
      "recordDemandItems",
    );
  }

  async demandItemsSince(sinceIso: string, filter?: { category?: string }): Promise<DemandItemRow[]> {
    const rows = await this.all<{
      session_id: string;
      created_at: string;
      event: DemandItemRow["event"];
      need_label: string;
      category: string | null;
      tags: string[];
      matched_count: number;
      budget_hint: number | null;
    }>((f, t) => {
      let b = this.db.from("demand_items").select("*").gte("created_at", sinceIso);
      if (filter?.category !== undefined) b = b.eq("category", filter.category);
      return b.order("id").range(f, t);
    }, "demandItemsSince");
    return rows.map((r) => ({
      sessionId: r.session_id,
      createdAt: iso(r.created_at)!,
      event: r.event,
      needLabel: r.need_label,
      category: r.category,
      tags: r.tags ?? [],
      matchedCount: r.matched_count,
      budgetHint: r.budget_hint,
    }));
  }

  async updateListing(
    productId: string,
    patch: Pick<Product, "title" | "description" | "tags" | "attributes">,
  ): Promise<Product> {
    const current = await this.getProduct(productId);
    if (!current) throw new Error(`product not found: ${productId}`);
    check(
      await this.db.from("product_versions").insert({ product_id: productId, snapshot: current }),
      "snapshot",
    );
    const row = check(
      await this.db
        .from("products")
        .update({
          title: patch.title,
          description: patch.description,
          tags: patch.tags,
          attributes: patch.attributes,
          updated_for_demand_at: todayIso(),
        })
        .eq("id", productId)
        .select("*")
        .single(),
      "updateListing",
    );
    return toProduct(row as ProductRow);
  }

  async undoListing(productId: string): Promise<Product | null> {
    const latest = check(
      await this.db
        .from("product_versions")
        .select("id, snapshot")
        .eq("product_id", productId)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "undoListing",
    ) as { id: number; snapshot: Product } | null;
    if (!latest) return null;
    const restore: Partial<ProductRow> = fromProduct(latest.snapshot);
    delete restore.id;
    const row = check(
      await this.db.from("products").update(restore).eq("id", productId).select("*").single(),
      "undoListing",
    );
    check(await this.db.from("product_versions").delete().eq("id", latest.id), "undoListing");
    return toProduct(row as ProductRow);
  }
}
