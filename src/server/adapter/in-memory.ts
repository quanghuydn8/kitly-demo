// InMemoryAdapter: a real CommerceAdapter over src/contract/fixtures (tests, KITLY_ADAPTER=memory, Lane 2 dev).
// Each instance deep-copies the fixtures, so instances never share state.
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
import { GUEST_PERSONA, PersonaSchema, ProductSchema, ShopSchema, VoucherSchema } from "@/contract";
import shopsFixture from "@/contract/fixtures/shops.json";
import productsFixture from "@/contract/fixtures/products.json";
import vouchersFixture from "@/contract/fixtures/vouchers.json";
import personasFixture from "@/contract/fixtures/personas.json";
import demandFixture from "@/contract/fixtures/demand.json";
import { demoNowIso } from "@/server/today";

type Source = "live" | "seed";
interface Session {
  id: string;
  query: string;
  event: EventType;
  plan: KitPlan | null;
  source: Source;
  createdAt: string;
}
type Row = DemandItemRow & { source: Source };

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryAdapter implements CommerceAdapter {
  // zod parse = validated deep copy of the fixtures
  private shops: Shop[] = ShopSchema.array().parse(shopsFixture);
  private products: Product[] = ProductSchema.array().parse(productsFixture);
  private vouchers: Voucher[] = VoucherSchema.array().parse(vouchersFixture);
  private personas: Persona[] = PersonaSchema.array().parse(personasFixture);
  private snapshots = new Map<string, Product[]>(); // productId -> stack of previous versions
  private sessions = new Map<string, Session>();
  private rows: Row[] = [];

  constructor() {
    for (const s of demandFixture) {
      const session: Session = { ...s, event: s.event as EventType, plan: null, source: s.source as Source };
      this.sessions.set(s.id, session);
      for (const i of s.items) {
        this.rows.push({ sessionId: s.id, createdAt: s.createdAt, event: session.event, source: session.source, ...i });
      }
    }
  }

  async listShops(): Promise<Shop[]> {
    return clone(this.shops);
  }

  async getProduct(id: string): Promise<Product | null> {
    const p = this.products.find((x) => x.id === id);
    return p ? clone(p) : null;
  }

  async searchProducts(q: ProductQuery): Promise<Product[]> {
    const text = q.text?.trim().toLowerCase();
    const cats = q.categories ?? (q.category ? [q.category] : null);
    const out = this.products.filter(
      (p) =>
        (!cats || cats.includes(p.category)) &&
        (!text || `${p.title} ${p.description} ${p.tags.join(" ")}`.toLowerCase().includes(text)) &&
        (!q.tagsAny?.length || q.tagsAny.some((t) => p.tags.includes(t))) &&
        (q.maxPrice === undefined || p.price <= q.maxPrice),
    );
    return clone(q.limit !== undefined ? out.slice(0, q.limit) : out);
  }

  async listVouchers(persona?: PersonaId): Promise<Voucher[]> {
    return clone(this.vouchers.filter((v) => v.ownerPersona === null || (persona && v.ownerPersona === persona)));
  }

  async getPersona(id: PersonaId): Promise<Persona> {
    if (id === "guest") return clone(GUEST_PERSONA);
    const p = this.personas.find((x) => x.id === id);
    if (!p) throw new Error(`persona ${id} not found`);
    return clone(p);
  }

  async recordIntent(s: { query: string; plan: KitPlan; source: Source }): Promise<{ sessionId: string }> {
    const id = crypto.randomUUID();
    this.sessions.set(id, {
      id,
      query: s.query,
      event: s.plan.event,
      plan: clone(s.plan),
      source: s.source,
      createdAt: demoNowIso(),
    });
    return { sessionId: id };
  }

  async recordDemandItems(
    sessionId: string,
    items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[],
  ): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`intent session ${sessionId} not found`);
    for (const { item, matchedCount, budgetHint } of items) {
      this.rows.push({
        sessionId,
        createdAt: s.createdAt,
        event: s.event,
        source: s.source,
        needLabel: item.needLabel,
        category: item.category,
        tags: [...item.mustHaveTags],
        matchedCount,
        budgetHint,
      });
    }
  }

  /** Test helper (not in the contract): number of intent sessions, seeded + recorded. */
  intentSessionCount(): number {
    return this.sessions.size;
  }

  async demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }): Promise<DemandItemRow[]> {
    return this.rows
      .filter((r) => r.createdAt >= sinceIso && (!filter?.category || r.category === filter.category))
      .map(({ source: _source, ...row }) => clone(row));
  }

  async recentDemandItems(limit: number): Promise<Row[]> {
    return this.rows
      .filter((r) => r.source === "live")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  async updateListing(productId: string, patch: ListingPatch): Promise<Product> {
    const i = this.products.findIndex((p) => p.id === productId);
    if (i < 0) throw new Error(`product ${productId} not found`);
    const stack = this.snapshots.get(productId) ?? [];
    stack.push(clone(this.products[i]));
    this.snapshots.set(productId, stack);
    this.products[i] = { ...this.products[i], ...clone(patch), updatedForDemandAt: demoNowIso() };
    return clone(this.products[i]);
  }

  async undoListing(productId: string): Promise<Product | null> {
    const prev = this.snapshots.get(productId)?.pop();
    if (!prev) return null;
    const i = this.products.findIndex((p) => p.id === productId);
    this.products[i] = prev;
    return clone(prev);
  }
}
