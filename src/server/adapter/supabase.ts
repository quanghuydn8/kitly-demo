// SupabaseAdapter: CommerceAdapter over the Kitly tables in KITLY_DB_SCHEMA (DATA.md §6) via supabase-js.
// Serverless-safe: no process state; every call reads/writes the database.
import type {
  CategoryId,
  CommerceAdapter,
  DemandItemRow,
  EventType,
  KitPlan,
  ListingPatch,
  Persona,
  PersonaId,
  PlanItem,
  Product,
  ProductQuery,
  Shop,
  Voucher,
} from "@/contract";
import { GUEST_PERSONA } from "@/contract";
import { fetchAll, iso, must, supabaseClient } from "@/server/db/supabase";
import { demoNowIso } from "@/server/today";

type Source = "live" | "seed";

interface ProductRow {
  id: string;
  shop_id: string;
  title: string;
  category: string;
  description: string;
  price: number;
  rating: number;
  review_count: number;
  sold_count: number;
  stock: number;
  tags: string[];
  attributes: Record<string, string>;
  ship_days_min: number;
  ship_days_max: number;
  updated_for_demand_at: string | null;
}
interface DemandRow {
  session_id: string;
  created_at: string;
  event: string;
  need_label: string;
  category: string | null;
  tags: string[];
  matched_count: number;
  budget_hint: number | null;
}

const toProduct = (r: ProductRow): Product => ({
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
  updatedForDemandAt: r.updated_for_demand_at ? iso(r.updated_for_demand_at) : null,
});

const toDemand = (r: DemandRow): DemandItemRow => ({
  sessionId: r.session_id,
  createdAt: iso(r.created_at),
  event: r.event as EventType,
  needLabel: r.need_label,
  category: r.category,
  tags: r.tags ?? [],
  matchedCount: r.matched_count,
  budgetHint: r.budget_hint,
});

interface ShopRow {
  id: string;
  name: string;
  tier: Shop["tier"];
  rating: number;
  ship_fee: number;
  city: string;
}
interface VoucherRow {
  id: string;
  scope: Voucher["scope"];
  shop_id: string | null;
  code: string;
  kind: Voucher["kind"];
  value: number;
  max_discount: number | null;
  min_spend: number;
  valid_until: string;
  owner_persona: Voucher["ownerPersona"];
  label: string;
}

const DEMAND_COLS = "session_id, created_at, event, need_label, category, tags, matched_count, budget_hint";

/** Strip PostgREST filter syntax characters from free text. */
const safeText = (t: string) => t.replace(/[,()*%\\]/g, " ").trim();

export class SupabaseAdapter implements CommerceAdapter {
  private get db() {
    return supabaseClient();
  }

  async listShops(): Promise<Shop[]> {
    const rows = must<ShopRow[]>(await this.db.from("shops").select("*").order("id"), "listShops");
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
    const row = must(await this.db.from("products").select("*").eq("id", id).maybeSingle(), "getProduct");
    return row ? toProduct(row as ProductRow) : null;
  }

  /** ONE query for the whole filter (D36), incl. categories[]. */
  async searchProducts(q: ProductQuery): Promise<Product[]> {
    const build = () => {
      let query = this.db.from("products").select("*");
      const cats = q.categories ?? (q.category ? [q.category] : null);
      if (cats) query = query.in("category", cats);
      const text = q.text ? safeText(q.text) : "";
      if (text) query = query.or(`title.ilike.*${text}*,description.ilike.*${text}*`);
      if (q.tagsAny?.length) query = query.overlaps("tags", q.tagsAny);
      if (q.maxPrice !== undefined) query = query.lte("price", q.maxPrice);
      return query.order("id");
    };
    const rows =
      q.limit !== undefined
        ? must(await build().limit(q.limit), "searchProducts")
        : await fetchAll((from, to) => build().range(from, to), "searchProducts");
    return (rows as ProductRow[]).map(toProduct);
  }

  async listVouchers(persona?: PersonaId): Promise<Voucher[]> {
    let query = this.db.from("vouchers").select("*");
    query =
      persona && persona !== "guest"
        ? query.or(`owner_persona.is.null,owner_persona.eq.${persona}`)
        : query.is("owner_persona", null);
    const rows = must<VoucherRow[]>(await query.order("id"), "listVouchers");
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
      ownerPersona: r.owner_persona,
      label: r.label,
    }));
  }

  async getPersona(id: PersonaId): Promise<Persona> {
    if (id === "guest") return structuredClone(GUEST_PERSONA);
    const r = must(await this.db.from("personas").select("*").eq("id", id).maybeSingle(), "getPersona");
    if (!r) throw new Error(`persona ${id} not found (run npm run seed)`);
    return {
      id: r.id,
      name: r.name,
      address: r.district && r.city ? { district: r.district, city: r.city } : null,
      favoriteShopIds: r.favorite_shop_ids ?? [],
      cart: (r.cart ?? []) as Persona["cart"],
    };
  }

  async recordIntent(s: { query: string; plan: KitPlan; source: Source }): Promise<{ sessionId: string }> {
    const row = must(
      await this.db
        .from("intent_sessions")
        .insert({
          query: s.query,
          event: s.plan.event,
          language: s.plan.language,
          plan: s.plan,
          source: s.source,
          created_at: demoNowIso(),
        })
        .select("id")
        .single(),
      "recordIntent",
    );
    return { sessionId: row.id };
  }

  async recordDemandItems(
    sessionId: string,
    items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[],
  ): Promise<void> {
    const s = must(
      await this.db.from("intent_sessions").select("event, created_at").eq("id", sessionId).maybeSingle(),
      "recordDemandItems",
    );
    if (!s) throw new Error(`intent session ${sessionId} not found`);
    if (!items.length) return;
    must(
      await this.db.from("demand_items").insert(
        items.map(({ item, matchedCount, budgetHint }) => ({
          session_id: sessionId,
          event: s.event,
          need_label: item.needLabel,
          category: item.category,
          tags: [...item.mustHaveTags],
          matched_count: matchedCount,
          budget_hint: budgetHint,
          created_at: s.created_at,
        })),
      ),
      "recordDemandItems",
    );
  }

  async demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }): Promise<DemandItemRow[]> {
    const rows = await fetchAll<DemandRow>((from, to) => {
      let q = this.db.from("demand_items").select(DEMAND_COLS).gte("created_at", sinceIso);
      if (filter?.category) q = q.eq("category", filter.category);
      return q.order("created_at").order("id").range(from, to);
    }, "demandItemsSince");
    return rows.map(toDemand);
  }

  /** Newest first, joined to intent_sessions.source = 'live' (D35). */
  async recentDemandItems(limit: number): Promise<(DemandItemRow & { source: Source })[]> {
    const rows = must(
      await this.db
        .from("demand_items")
        .select(`${DEMAND_COLS}, intent_sessions!inner(source)`)
        .eq("intent_sessions.source", "live")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      "recentDemandItems",
    );
    return (rows as unknown as DemandRow[]).map((r) => ({ ...toDemand(r), source: "live" as const }));
  }

  async updateListing(productId: string, patch: ListingPatch): Promise<Product> {
    const before = await this.getProduct(productId);
    if (!before) throw new Error(`product ${productId} not found`);
    must(
      await this.db.from("product_versions").insert({ product_id: productId, snapshot: before }),
      "updateListing snapshot",
    );
    const row = must(
      await this.db
        .from("products")
        .update({
          title: patch.title,
          description: patch.description,
          tags: patch.tags,
          attributes: patch.attributes,
          updated_for_demand_at: demoNowIso(),
        })
        .eq("id", productId)
        .select("*")
        .single(),
      "updateListing",
    );
    return toProduct(row as ProductRow);
  }

  async undoListing(productId: string): Promise<Product | null> {
    const snap = must(
      await this.db
        .from("product_versions")
        .select("id, snapshot")
        .eq("product_id", productId)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "undoListing",
    );
    if (!snap) return null;
    const prev = snap.snapshot as Product;
    const row = must(
      await this.db
        .from("products")
        .update({
          title: prev.title,
          description: prev.description,
          tags: prev.tags,
          attributes: prev.attributes,
          updated_for_demand_at: prev.updatedForDemandAt,
        })
        .eq("id", productId)
        .select("*")
        .single(),
      "undoListing restore",
    );
    must(await this.db.from("product_versions").delete().eq("id", snap.id), "undoListing pop");
    return toProduct(row as ProductRow);
  }
}
