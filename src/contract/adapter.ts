// The plug-in seams (CONTRACT.md §2): CommerceAdapter (marketplace data) and KitStore (Kitly threads/versions).
// Implementations live in src/server/; Kitly modules depend only on these interfaces.
import type {
  CategoryId,
  DemandItemRow,
  KitMessage,
  KitPlan,
  KitSelection,
  KitThreadSummary,
  KitVersion,
  Persona,
  PersonaId,
  PlanItem,
  Product,
  Shop,
  Voucher,
} from "./domain";

export interface ProductQuery {
  text?: string;
  category?: CategoryId;
  categories?: CategoryId[]; // one query for a whole plan (D36)
  tagsAny?: string[];
  maxPrice?: number;
  limit?: number;
}

export type ListingPatch = Pick<Product, "title" | "description" | "tags" | "attributes">;

export interface CommerceAdapter {
  listShops(): Promise<Shop[]>;
  getProduct(id: string): Promise<Product | null>;
  searchProducts(q: ProductQuery): Promise<Product[]>;
  /** Public vouchers + that persona's wallet vouchers (none for guest/undefined). */
  listVouchers(persona?: PersonaId): Promise<Voucher[]>;
  getPersona(id: PersonaId): Promise<Persona>;
  recordIntent(s: { query: string; plan: KitPlan; source: "live" | "seed" }): Promise<{ sessionId: string }>;
  recordDemandItems(
    sessionId: string,
    items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[],
  ): Promise<void>;
  demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }): Promise<DemandItemRow[]>;
  /** Newest first, live sessions only (D35). */
  recentDemandItems(limit: number): Promise<(DemandItemRow & { source: "live" | "seed" })[]>;
  /** Snapshots the previous version, then applies the patch. */
  updateListing(productId: string, patch: ListingPatch): Promise<Product>;
  /** Restores the latest snapshot; null if none. */
  undoListing(productId: string): Promise<Product | null>;
}

export interface KitStore {
  createThread(owner: string, title: string, persona: PersonaId): Promise<{ threadId: string }>;
  appendMessage(m: Omit<KitMessage, "createdAt">, owner: string): Promise<KitMessage>;
  /** version = last + 1 */
  appendVersion(v: Omit<KitVersion, "version" | "createdAt">, owner: string): Promise<KitVersion>;
  /** On the latest version. */
  saveSelection(threadId: string, owner: string, selection: KitSelection): Promise<void>;
  /** updatedAt desc, max 30 */
  listThreads(owner: string): Promise<KitThreadSummary[]>;
  /** null if the thread does not exist or is not the owner's. */
  getThread(
    threadId: string,
    owner: string,
  ): Promise<{ thread: KitThreadSummary; versions: KitVersion[]; messages: KitMessage[] } | null>;
}
