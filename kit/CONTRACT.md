# Kitly — Contract (types, adapter, API)

Source of truth for Lane 1 (backend) and Lane 2 (frontend). Ticket 00 turns this file into
`src/contract/` (TypeScript types + zod schemas + fixtures). After ticket 00 the contract is **frozen**:
only Lane 1 may change it, in a dedicated commit titled `contract: …`, and must tell Lane 2.

Money is integer VND. Dates are ISO `YYYY-MM-DD`. IDs are strings.

## 1. Domain types

```ts
type EventType = "back_to_school" | "newborn" | "first_apartment" | "camping_trip" | "home_office" | "tet_gifts" | "other";
type ShopTier = "mall" | "preferred" | "regular";
type CategoryId = string;            // one of DATA.md taxonomy ids, e.g. "school-backpack"

interface Shop { id: string; name: string; tier: ShopTier; rating: number; shipFee: number; city: string }

interface Product {
  id: string; shopId: string; title: string; category: CategoryId; description: string;
  price: number; rating: number; reviewCount: number; soldCount: number; stock: number;
  tags: string[];                       // normalized kebab-case, e.g. "anti-hunchback", "grade-1"
  attributes: Record<string, string>;   // e.g. { weight: "0.75 kg", age: "6-8" }
  shipDaysMin: number; shipDaysMax: number;
  updatedForDemandAt: string | null;    // ISO datetime, set when an enrichment is applied
}

interface Voucher {
  id: string; scope: "platform" | "shop"; shopId: string | null; code: string;
  kind: "fixed" | "percent" | "freeship";
  value: number;          // fixed: VND off; percent: 0-100; freeship: max shipping covered (VND)
  maxDiscount: number | null; minSpend: number; validUntil: string;
}

interface PlanItem {
  key: string;                          // stable within a plan, e.g. "backpack"
  needLabel: string;                    // buyer-language label, e.g. "Anti-hunchback backpack"
  category: CategoryId | null;          // null = not covered by taxonomy
  required: boolean;                    // must-have vs nice-to-have
  quantity: number;
  mustHaveTags: string[]; niceToHaveTags: string[];
  maxUnitPrice: number | null;
}

interface KitPlan {
  event: EventType; language: "en" | "vi";
  budget: number | null; deadline: string | null;
  items: PlanItem[]; assumptions: string[];
}

interface Candidate { product: Product; shop: Shop; score: number; matchedTags: string[]; arrivesBy: string }

interface BasketLine {
  itemKey: string; product: Product; shop: Shop; quantity: number; lineTotal: number;
  reason: string;                       // short, code-generated, e.g. "Best rated under 400k, arrives Aug 27"
  alternatives: Candidate[];            // up to 2, other shops
}

interface ShopGroup { shopId: string; shopName: string; subtotal: number; shipping: number; shopDiscount: number; voucherCodes: string[] }

interface Saving { label: string; amount: number }    // "Buy 4 items at Minh An Stationery: free shipping + 30k voucher"

interface BasketOption {
  profile: "saver" | "balanced" | "premium";
  status: "ok" | "over_budget";
  lines: BasketLine[];
  noMatch: { itemKey: string; needLabel: string; reason: "no_category" | "no_product_with_tags" | "none_in_time" | "none_in_budget" }[];
  skipped: { itemKey: string; needLabel: string; reason: "budget" }[];   // nice-to-haves dropped
  shops: ShopGroup[];
  itemsTotal: number; shippingTotal: number; discountTotal: number; grandTotal: number;
  savings: Saving[];
  minimumCost?: number; costDrivers?: string[];      // only when over_budget
}

interface PlanDiff { added: string[]; removed: string[]; changed: string[] }      // item keys
```

## 2. Commerce Adapter (the plug-in seam)

```ts
interface CommerceAdapter {
  listShops(): Promise<Shop[]>;
  getProduct(id: string): Promise<Product | null>;
  searchProducts(q: { text?: string; category?: CategoryId; tagsAny?: string[]; maxPrice?: number; limit?: number }): Promise<Product[]>;
  listVouchers(): Promise<Voucher[]>;
  recordIntent(s: { query: string; plan: KitPlan; source: "live" | "seed" }): Promise<{ sessionId: string }>;
  getIntentSession(sessionId: string): Promise<{ sessionId: string; query: string; plan: KitPlan } | null>;  // null if unknown/malformed
  recordDemandItems(sessionId: string, items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[]): Promise<void>;
  demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }): Promise<DemandItemRow[]>;
  updateListing(productId: string, patch: Pick<Product, "title" | "description" | "tags" | "attributes">): Promise<Product>;  // snapshots previous version
  undoListing(productId: string): Promise<Product | null>;   // restores latest snapshot, null if none
  getInsightAdvice(gapKeys: string[]): Promise<InsightAdvice[]>;   // cached seller advice (insight_advice); unknown keys absent
  saveInsightAdvice(row: InsightAdvice): Promise<void>;            // upsert by gapKey
  addDemandWatch(gapKey: string): Promise<number>;                 // Full: insert one demand_watches row, return new count
  countDemandWatches(gapKeys: string[]): Promise<Record<string, number>>;  // Full: every key present, 0 if none
}
interface InsightAdvice { gapKey: string; countsSignature: string; advice: string }
interface DemandItemRow { sessionId: string; createdAt: string; event: EventType; needLabel: string; category: CategoryId | null; tags: string[]; matchedCount: number; budgetHint: number | null }
```

Implementations: `SupabaseAdapter` (prod) and `InMemoryAdapter` (tests, `KITLY_ADAPTER=memory`, loads
`src/contract/fixtures`). Kitly modules never import Supabase directly.

## 3. HTTP API

All JSON. Errors: `{ error: { code: string, message: string } }` with 4xx/5xx.

### Store
| Method | Path | Query/body | Response |
|---|---|---|---|
| GET | `/api/products` | `q?`, `category?`, `limit?` (default 40) | `{ products: (Product & { shop: Shop })[] }` |
| GET | `/api/products/:id` | — | `{ product: Product, shop: Shop, vouchers: Voucher[] }` |
| GET | `/api/shops` | — | `{ shops: Shop[] }` |
| GET | `/api/categories` | — | `{ categories: { id, label, event, icon, color }[] }` |
| POST | `/api/checkout` | `{ lines: { productId, quantity }[] }` | `{ orderId: string, grandTotal: number }` (fake, nothing persisted beyond a log) |

### Kitly (Server-Sent Events)
`POST /api/kit` body `{ query: string, profiles?: ("saver"|"balanced"|"premium")[] }` (default `["balanced"]`).
`POST /api/kit/refine` body `{ sessionId: string, previousPlan: KitPlan, message: string, profiles? }`.

Response `Content-Type: text/event-stream`. Events, in this order:

| event | data | notes |
|---|---|---|
| `step` | `{ id: "understand"\|"plan"\|"search"\|"optimize"\|"explain", status: "running"\|"done", detail?: string }` | e.g. detail `"Planned 9 items"`, `"Compared 47 products from 12 shops"` |
| `plan` | `{ sessionId, plan: KitPlan, diff?: PlanDiff }` | `diff` only on refine |
| `options` | `{ options: BasketOption[] }` | one per requested profile |
| `explanation` | `{ delta: string }` | streamed many times |
| `done` | `{ sessionId }` | |
| `error` | `{ code, message }` | terminal; UI shows it in the timeline |

### Seller Intelligence
`GET /api/seller/insights?shopId=<id|all>` →
```ts
{
  window: { thisWeekFrom: string, lastWeekFrom: string, today: string },
  gaps: {
    key: string;                        // `${category ?? "none"}|${sorted tags}`
    type: "listing_gap" | "assortment_gap";
    needLabel: string; category: CategoryId | null; tags: string[];
    thisWeek: number; lastWeek: number; matchingProducts: number;
    priceBand: { p25: number, p75: number } | null;
    neededWith: { category: CategoryId, share: number }[];   // top 3
    advice: string;                     // fast-model sentence, cached
    candidates?: { productId: string, title: string, evidence: string }[];   // listing_gap only, this shop's products
    watchers?: number;                  // Full
  }[];
  combos: { categories: CategoryId[], count: number }[];     // top 5, this week
  topNeeds: { event: EventType, count: number }[];
}
```
`POST /api/seller/enrichment/preview` `{ productId, gapKey }` →
`{ proposalId, before: Product, after: Product, added: { titleSuffix: string, tags: string[], attributes: Record<string,string>, descriptionAppend: string }, kept: { title: string, tags: string[] }, keywordCheck: { keyword: string, stillMatches: boolean }[], evidence: string }`

`POST /api/seller/enrichment/apply` `{ proposalId }` → `{ product: Product }`
`POST /api/seller/enrichment/undo` `{ productId }` → `{ product: Product }` (404 if nothing to undo)

### Full mode only
`POST /api/demand/watch` `{ gapKey }` → `{ watchers: number }`

## 4. Fixtures (ticket 00)

`src/contract/fixtures/` holds a mini dataset that satisfies every type: 6 shops, ~30 products (incl. the
planted hero backpack listing gap from DATA.md §4), 5 vouchers, ~60 demand rows, plus a recorded sample of
each SSE stream (`kit.sample.json` = array of `{event, data}`) so Lane 2 can render the Kitly screen before
the real pipeline exists (`NEXT_PUBLIC_KITLY_MOCK=1` replays it with 300 ms gaps).
