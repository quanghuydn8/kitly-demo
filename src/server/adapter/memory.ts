// InMemoryAdapter: a real CommerceAdapter over src/contract/fixtures. Used by tests and KITLY_ADAPTER=memory.
import { randomUUID } from "node:crypto";
import { fixtures } from "@/contract/fixtures";
import type {
  CommerceAdapter,
  DemandItemRow,
  InsightAdvice,
  KitPlan,
  PlanItem,
  Product,
  ProductQuery,
  Shop,
  Voucher,
} from "@/contract/types";
import { todayIso } from "@/server/today";

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryAdapter implements CommerceAdapter {
  private shops: Shop[] = clone(fixtures.shops);
  private products = new Map<string, Product>(clone(fixtures.products).map((p) => [p.id, p]));
  private vouchers: Voucher[] = clone(fixtures.vouchers);
  private demand: DemandItemRow[] = clone(fixtures.demandItems);
  private sessions = new Map<string, { query: string; plan: KitPlan; source: string; createdAt: string }>();
  private versions = new Map<string, Product[]>(); // productId -> snapshot stack
  private advice = new Map<string, InsightAdvice>(); // gapKey -> cached advice
  private watches = new Map<string, number>(); // gapKey -> "Notify me" count

  async listShops() {
    return clone(this.shops);
  }

  async getProduct(id: string) {
    const p = this.products.get(id);
    return p ? clone(p) : null;
  }

  async searchProducts(q: ProductQuery) {
    const words = (q.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const out = [...this.products.values()].filter((p) => {
      if (q.category && p.category !== q.category) return false;
      if (q.maxPrice != null && p.price > q.maxPrice) return false;
      if (q.tagsAny?.length && !q.tagsAny.some((t) => p.tags.includes(t))) return false;
      if (words.length) {
        const hay = `${p.title} ${p.description} ${p.tags.join(" ")}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    return clone(out.slice(0, q.limit ?? out.length));
  }

  async listVouchers() {
    return clone(this.vouchers);
  }

  async recordIntent(s: { query: string; plan: KitPlan; source: "live" | "seed" }) {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { ...clone(s), createdAt: todayIso() });
    return { sessionId };
  }

  async getIntentSession(sessionId: string) {
    const s = this.sessions.get(sessionId);
    return s ? { sessionId, query: s.query, plan: clone(s.plan) } : null;
  }

  async recordDemandItems(
    sessionId: string,
    items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[],
  ) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`unknown session ${sessionId}`);
    for (const { item, matchedCount, budgetHint } of items) {
      this.demand.push({
        sessionId,
        createdAt: session.createdAt,
        event: session.plan.event,
        needLabel: item.needLabel,
        category: item.category,
        tags: [...item.mustHaveTags],
        matchedCount,
        budgetHint,
      });
    }
  }

  async demandItemsSince(sinceIso: string, filter?: { category?: string }) {
    return clone(
      this.demand.filter(
        (r) => r.createdAt >= sinceIso && (filter?.category === undefined || r.category === filter.category),
      ),
    );
  }

  async updateListing(
    productId: string,
    patch: Pick<Product, "title" | "description" | "tags" | "attributes">,
  ) {
    const current = this.products.get(productId);
    if (!current) throw new Error(`product not found: ${productId}`);
    const stack = this.versions.get(productId) ?? [];
    stack.push(clone(current));
    this.versions.set(productId, stack);
    const next: Product = { ...current, ...clone(patch), updatedForDemandAt: todayIso() };
    this.products.set(productId, next);
    return clone(next);
  }

  async undoListing(productId: string) {
    const prev = this.versions.get(productId)?.pop();
    if (!prev) return null;
    this.products.set(productId, prev);
    return clone(prev);
  }

  async getInsightAdvice(gapKeys: string[]) {
    return gapKeys.flatMap((k) => (this.advice.has(k) ? [clone(this.advice.get(k)!)] : []));
  }

  async saveInsightAdvice(row: InsightAdvice) {
    this.advice.set(row.gapKey, clone(row));
  }

  async addDemandWatch(gapKey: string) {
    const n = (this.watches.get(gapKey) ?? 0) + 1;
    this.watches.set(gapKey, n);
    return n;
  }

  async countDemandWatches(gapKeys: string[]) {
    return Object.fromEntries(gapKeys.map((k) => [k, this.watches.get(k) ?? 0]));
  }
}
