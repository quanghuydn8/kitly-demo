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
  ownerPersona: PersonaId | null;   // null = public voucher; else a WALLET voucher only that persona may use (D46)
  label: string;                    // short human label, e.g. "KidZone 80k off", "Back-to-school 10%"
}

// ---- Buyer persona (D39/D43): what the marketplace already knows about the buyer. One demo persona + guest. ----
type PersonaId = "lan" | "guest";
interface Persona {
  id: PersonaId; name: string;                          // "Lan" / "Guest"
  address: { district: string; city: string } | null;  // display + AI context only (D44), never changes delivery maths
  favoriteShopIds: string[];
  cart: { productId: string; addedAt: string }[];      // products left in the cart, not bought
}
// guest = { id: "guest", name: "Guest", address: null, favoriteShopIds: [], cart: [] } and no wallet vouchers.

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
  // deadline: the planner infers it when the sentence has none — back_to_school ⇒ the next Sep 5 on/after DEMO_TODAY
  // (Vietnamese school opening, with an assumption chip "By Sep 5 (school opening)"); "express"/"hoả tốc" ⇒ today + 2 (D44/D45).
  budget: number | null; deadline: string | null;
  items: PlanItem[]; assumptions: string[];
}

// score = QUALITY only, in [0,1]: nice-to-have tag match 0.35, rating 0.35, log review volume 0.18, shop tier 0.12.
// Price is NEVER part of score (30/10: a price term made "premium" pick the cheapest products). Cost is handled
// only by the Optimizer's profile objective.
interface Candidate { product: Product; shop: Shop; score: number; matchedTags: string[]; arrivesBy: string }

// Closest product for a plan item with no exact match (D27). Relax order: mustHaveTags first, then maxUnitPrice.
// Deadline and stock are NEVER relaxed. Never added to the basket automatically ("Add anyway", D28).
interface Closest { candidate: Candidate; missingTags: string[]; overMaxPriceBy: number | null }

interface BasketLine {
  itemKey: string; product: Product; shop: Shop; quantity: number; lineTotal: number;
  reason: string;                       // short, code-generated, e.g. "Best rated under 400k, arrives Sep 4"
  alternatives: Candidate[];            // up to 2, other shops
}

interface ShopGroup { shopId: string; shopName: string; subtotal: number; shipping: number; shopDiscount: number; voucherCodes: string[] }

interface Saving { label: string; amount: number; wallet?: boolean }   // wallet = a voucher from the buyer's wallet (D46): label starts "Your wallet voucher"
    // "Buy 4 items at Minh An Stationery: free shipping + 30k voucher"
// SAVINGS DEFINITION: `savings` lists ONLY deductions actually applied in this option: free shipping (FREESHIP),
// shop vouchers, platform vouchers (and the consolidation swap saving only if it is a real price drop). It never
// contains hypothetical lines such as "one shipping fee instead of several". Invariant (tested):
// sum(savings[].amount) === discountTotal, i.e. exactly the "Discounts" figure shown in the totals panel.

interface BasketOption {
  profile: "saver" | "balanced" | "premium";
  status: "ok" | "over_budget";
  lines: BasketLine[];
  noMatch: { itemKey: string; needLabel: string; reason: "no_category" | "no_product_with_tags" | "none_in_time" | "none_in_budget"; closest: Closest | null }[];
  skipped: { itemKey: string; needLabel: string; reason: "budget" }[];   // nice-to-haves dropped
  shops: ShopGroup[];
  itemsTotal: number; shippingTotal: number; discountTotal: number; grandTotal: number;
  savings: Saving[];
  minimumCost?: number; costDrivers?: string[];      // only when over_budget
  overBy?: number;                                   // only when over_budget: grandTotal - budget (> 0)
  fit?: FitSuggestion[];                             // only when over_budget: 1–2 code-computed ways back under budget
  interests?: Interest[];                            // D40: products from the persona's cart that fit a plan item (never in lines)
}

// "💛 In your cart" card (D40), computed by CODE: for each cart product whose category equals a plan item's category,
// that is in stock, arrives by the deadline and is NOT the line's chosen product. Ignores mustHaveTags and maxUnitPrice
// (the buyer already wanted it); shows what it lacks instead. Never added to the basket automatically: the card's
// "Switch to this" sends it as a `picks` swap to POST /api/kit/price.
interface Interest {
  itemKey: string; candidate: Candidate; addedToCartAt: string;
  walletVoucherCode: string | null;       // best single wallet/shop voucher usable on this product alone
  priceAfterVoucher: number;              // product.price − that voucher (single-item view; the basket re-price is exact)
  overMaxPriceBy: number | null;          // vs the item's maxUnitPrice, on priceAfterVoucher
  missingTags: string[];                  // item mustHaveTags the product lacks
}

// "Fit to budget" (D29). Computed by code (no LLM), label from a code template in plan.language, e.g.
// en "Drop Lunch box and switch Shoes to PikoStep Canvas: 980.000₫" / vi "Bỏ Hộp cơm, đổi Giày sang PikoStep Canvas: 980.000₫".
// Order of moves: (1) items the buyer added with "Add anyway", (2) nice-to-haves, lowest score per ₫ first,
// (3) swap lines to their cheapest alternative, (4) must-haves only if nothing else fits (dropsMustHave = true).
interface FitSuggestion {
  id: string; label: string;
  removeItemKeys: string[]; swaps: { itemKey: string; productId: string }[];
  grandTotal: number; fits: boolean; dropsMustHave: boolean;
}

// Profiles (D34), all over the SAME candidate pool and the SAME item set; status ok ⇒ grandTotal ≤ budget for every profile.
//   saver    = lowest grandTotal (items + shipping − vouchers); ties → higher Σscore.
//   premium  = highest Σscore (quality) within budget; ties → lower grandTotal. Budget null → highest Σscore.
//   balanced = maximise Σscore − α·grandTotal/costUnit (α between the two extremes).
// Invariants (tested on the hero fixture with budget 3,000,000): saver.grandTotal ≤ balanced.grandTotal ≤ premium.grandTotal;
// premium Σscore > saver Σscore; premium differs from saver on ≥ 2 lines.
type Profile = "saver" | "balanced" | "premium";

interface PlanDiff { added: string[]; removed: string[]; changed: string[] }      // item keys

// ---- Sales context + follow-up question (D41) ----
// Built by CODE from the persona, the plan and the chosen (Balanced) option; the ONLY facts the follow-up may cite.
interface SalesContext {
  today: string; deadline: string | null; daysLeft: number | null;
  address: string | null;                                   // "Cau Giay, Hanoi"
  interests: { itemKey: string; title: string; price: number; priceAfterVoucher: number; voucherCode: string | null; overMaxPriceBy: number | null }[];
  walletVouchers: { code: string; label: string; validUntil: string; daysToExpiry: number; usedInBasket: boolean }[];
  freeshipGaps: { shopName: string; missing: number }[];   // shop groups below the FREESHIP min spend, missing ≤ 100,000
  favoriteShopPromos: { shopName: string; code: string; label: string }[];
  hooks: ("deadline_soon" | "cart_interest" | "voucher_expiring" | "freeship_gap" | "favorite_shop_promo")[];
  // hooks present, in priority order (deadline_soon = daysLeft ≤ 3). A hint for the model, not a rule.
}
interface FollowUp {
  question: string;                       // exactly one question, plan language, ends with "?"
  suggestions: { text: string; action?: { type: "swap"; itemKey: string; productId: string } }[];   // 2–3, ≤ 40 chars
  source: "llm" | "template";             // template = code fallback (guard failed, LLM error or timeout)
}
// Guard (code): every number ≥ 1,000 (incl. "440k", "440.000₫") and every voucher code in question/suggestions must
// appear in the SalesContext or the option totals; dates must equal today/deadline. Else the follow-up is replaced
// by the code template of the first hook (vi/en), e.g. deadline_soon vi "Còn 3 ngày nữa là khai giảng 5/9, bạn có
// muốn chuyển sang giao hoả tốc để chắc chắn nhận kịp không?" with ["Giao hoả tốc", "Giữ như cũ"].
// No hooks ⇒ vi "Bạn muốn chỉnh gì thêm cho bộ đồ này không?" / en "Anything you'd like to change in this kit?".
// A suggestion the model ties to an interest (`interestItemKey`) gets the swap action from code.

// ---- Kit threads (D30/D31): a chat-like history of kits, owned by a browser cookie `kitly_uid` ----
interface KitSelection {                // the buyer's edits on top of the optimizer output, for ONE profile
  profile: Profile;
  picks: Record<string, string>;        // itemKey -> productId: swaps and "Add anyway" closest products
  dropped: string[];                    // itemKeys removed from the basket by "Fit to budget" (plan unchanged)
}
interface KitVersion {
  threadId: string; version: number;    // 1, 2, 3… inside the thread
  createdAt: string;
  kind: "new" | "refine" | "adjust" | "restore";
  userText: string;                     // the need sentence, the refine message, or a code label ("Removed: Lunch box")
  plan: KitPlan;
  excludedKeys: string[];               // items the buyer removed with ✕ (D33): never planned again in this thread
  status: "awaiting_budget" | "ready";  // awaiting_budget = the planner found no budget (D32): no options yet
  options: BasketOption[];              // [] while awaiting_budget
  explanation: string;                  // final explainer text ("" while awaiting_budget)
  diff: PlanDiff | null;                // vs the previous version
  selection: KitSelection | null;       // latest buyer edits, saved by POST /api/kit/price
  followUp: FollowUp | null;            // null for adjust/restore versions and while awaiting_budget
}
// A chat turn that only answers (planner intent "answer", D42): no new version, the kit does not change.
interface KitMessage {
  threadId: string; afterVersion: number;   // the version that was current when asked
  createdAt: string; userText: string; answer: string; followUp: FollowUp | null;
}
interface KitThreadSummary { id: string; title: string; updatedAt: string; versionCount: number; persona: PersonaId }  // title = first need sentence, ≤ 60 chars
```

## 2. Commerce Adapter (the plug-in seam)

```ts
interface CommerceAdapter {
  listShops(): Promise<Shop[]>;
  getProduct(id: string): Promise<Product | null>;
  searchProducts(q: { text?: string; category?: CategoryId; tagsAny?: string[]; maxPrice?: number; limit?: number }): Promise<Product[]>;
  listVouchers(persona?: PersonaId): Promise<Voucher[]>;   // public vouchers + that persona's wallet vouchers (none for guest/undefined)
  getPersona(id: PersonaId): Promise<Persona>;             // guest is a constant, lan comes from the `personas` table
  recordIntent(s: { query: string; plan: KitPlan; source: "live" | "seed" }): Promise<{ sessionId: string }>;
  recordDemandItems(sessionId: string, items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[]): Promise<void>;
  demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }): Promise<DemandItemRow[]>;
  updateListing(productId: string, patch: Pick<Product, "title" | "description" | "tags" | "attributes">): Promise<Product>;  // snapshots previous version
  undoListing(productId: string): Promise<Product | null>;   // restores latest snapshot, null if none
}
interface DemandItemRow { sessionId: string; createdAt: string; event: EventType; needLabel: string; category: CategoryId | null; tags: string[]; matchedCount: number; budgetHint: number | null }
```

`searchProducts` also accepts `categories?: CategoryId[]` (one query for a whole plan, D36: the pipeline makes ONE
catalog round trip, not one per item). Added for the live seller strip (D35):
`recentDemandItems(limit: number): Promise<(DemandItemRow & { source: "live" | "seed" })[]>` — newest first, `source = "live"` only.

Implementations: `SupabaseAdapter` (prod) and `InMemoryAdapter` (tests, `KITLY_ADAPTER=memory`, loads
`src/contract/fixtures`). Kitly modules never import Supabase directly.

### KitStore (Kitly's own data: threads and versions)
```ts
interface KitStore {
  createThread(owner: string, title: string, persona: PersonaId): Promise<{ threadId: string }>;
  appendMessage(m: Omit<KitMessage, "createdAt">, owner: string): Promise<KitMessage>;   // answer turns (D42)
  appendVersion(v: Omit<KitVersion, "version" | "createdAt">, owner: string): Promise<KitVersion>;  // version = last + 1
  saveSelection(threadId: string, owner: string, selection: KitSelection): Promise<void>;           // on the latest version
  listThreads(owner: string): Promise<KitThreadSummary[]>;          // updatedAt desc, max 30
  getThread(threadId: string, owner: string): Promise<{ thread: KitThreadSummary; versions: KitVersion[]; messages: KitMessage[] } | null>;  // null if not the owner
}
```
Same two implementations (Supabase tables `kit_threads` / `kit_versions` in DATA.md §6, and in-memory), same factory
switch `KITLY_ADAPTER`. **Owner** = cookie `kitly_uid` (random UUID, httpOnly, SameSite=Lax, 1 year), set by
`src/middleware.ts` when missing. Another browser's thread → 404.
**Persona** = cookie `kitly_persona` (`lan` | `guest`, missing ⇒ `lan`, D43), set by `POST /api/persona`. It is copied
onto a thread when the thread is created; refine / adjust / price / answer always use the **thread's** persona.

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
| GET | `/api/persona` | — | `{ persona: Persona, walletVouchers: Voucher[] }` for the cookie (D43) |
| POST | `/api/persona` | `{ id: PersonaId }` | same as GET; sets cookie `kitly_persona` (SameSite=Lax, 1 year) |

### Kitly (Server-Sent Events)
`POST /api/kit` body `{ query: string, profiles?: Profile[] }` (UI sends all three) → creates a thread + version 1.
`POST /api/kit/refine` body `{ threadId: string, message: string, profiles? }` → the server loads the latest version
(plan + `excludedKeys`) and appends a new version. 404 if the thread is not the caller's.
**Intent (D42):** in refine the planner also returns `intent: "change_kit" | "answer"`. `answer` = the message asks about
the kit, a product or the occasion without changing a constraint ("is the Minh An backpack really anti-hunchback?").
Then: no new version, no intent session, no demand; the stream is `step understand (detail "Answering")` →
`explanation` deltas (the answer, fast model, ≤ 80 words, from the current version + SalesContext + product facts) →
`followup` → `done { sessionId: null, threadId, version: <unchanged>, answered: true }`, and a `KitMessage` is saved
before `done`. When unsure the planner must choose `change_kit` only if a constraint changes.
**Refine records an intent session but NO demand items** — a refinement is the same buyer need, not new demand.
`adapter.recordIntent` is called; `adapter.recordDemandItems` is NOT.
**Demand items are recorded once per thread**, on the first run that produces options (version 1, or the
`set_budget` answer to a clarify). Never on refine/adjust/price.

Response `Content-Type: text/event-stream`. Events, in this order:

| event | data | notes |
|---|---|---|
| `step` | `{ id: "understand"\|"plan"\|"search"\|"optimize"\|"explain", status: "running"\|"done", detail?: string }` | e.g. detail `"Planned 9 items"`, `"Compared 47 products from 12 shops"` |
| `plan` | `{ sessionId, threadId, version, plan: KitPlan, diff?: PlanDiff }` | `diff` only on refine |
| `clarify` | `{ threadId, version, question: { kind: "budget", text: string, choices: (number \| null)[] } }` | only when `plan.budget === null` (decided by CODE, D32); `text` in plan language; choices `[500000, 1000000, 2000000, null]` (null = "No limit"). Then `done` — no `options`, version saved with `status: "awaiting_budget"`. |
| `options` | `{ options: BasketOption[] }` | one per requested profile; sent BEFORE the explanation starts |
| `explanation` | `{ delta: string }` | streamed many times |
| `followup` | `{ followUp: FollowUp }` | after the explanation (generated in parallel with it), before `done`; ALWAYS sent when `options` was sent or on an answer turn (template fallback) |
| `done` | `{ sessionId, threadId, version, answered?: true }` | the version (options + full explanation + followUp) is saved before `done` |
| `error` | `{ code, message }` | terminal; UI shows it in the timeline. Only for failures BEFORE `options`. |

**Explainer failure never fails the kit.** Once `options` was sent, an explainer error/stall ends with
`step explain done { detail: "Explanation unavailable" }` then `done` (rehearsal 28/10: a proxy stall mid-explanation
turned a finished basket into an error).

### Kit edits (JSON, no LLM, < 1 s) and history
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/kit/adjust` | `{ threadId, change }` where `change` is one of `{ type: "set_budget", budget: number \| null }`, `{ type: "set_deadline", deadline: string \| null }`, `{ type: "remove_item", itemKey }`, `{ type: "restore_item", itemKey }`, `{ type: "restore_version", version }` | `{ version: KitVersion }` (new version, `kind: "adjust"`/`"restore"`) |
| POST | `/api/kit/price` | `{ threadId, selection: KitSelection }` | `{ option: BasketOption }` re-priced with the selection (and `fit` when over budget); saves the selection on the latest version (no new version) |
| GET | `/api/threads` | — | `{ threads: KitThreadSummary[] }` for the caller's cookie |
| GET | `/api/threads/:id` | — | `{ thread: KitThreadSummary, versions: KitVersion[] }` (404 if not the caller's) |

`/api/kit/price` also accepts, as a `picks` product, a product from the option's `interests` for that item (D40).
`adjust` re-runs Matcher + Optimizer on the stored plan with code only (no Planner, no Explainer); its `explanation`
is a code-template line in the plan language ("Removed Lunch box. New total 820.000₫."). `remove_item` adds the key
to `excludedKeys` (the item disappears from plan and basket); `restore_item` removes it. `set_budget` on an
`awaiting_budget` version produces the first options of the thread (and records demand items).
**Refine never brings back an excluded item:** the planner prompt lists them as "the buyer already has these, never
add them", and code removes any returned item whose key or category matches an excluded item.

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
    appliedFix: { productId: string, title: string, appliedAt: string } | null;   // always present; see rules below
    watchers?: number;                  // Full
  }[];
  combos: { categories: CategoryId[], count: number }[];     // top 5, this week
  topNeeds: { event: EventType, count: number }[];
  recent: { needLabel: string; category: CategoryId | null; tags: string[]; event: EventType; createdAt: string }[];
  // D35: the 10 newest LIVE unmet demand items (matchedCount < 2), any shop, no threshold, newest first.
}
```
**Gap rules (normative).**
- **Counting:** `thisWeek` / `lastWeek` count **distinct `sessionId`s** that contain a matching unmet demand item,
  never rows (a session with two matching items counts once).
- **Visibility threshold:** a gap is returned only when `thisWeek >= 3`. Gaps with 1–2 sessions are dropped.
- **Null-category needs:** all unmet demand items with `category: null` are grouped into ONE gap: key `none|`,
  `type: "assortment_gap"`, `category: null`, `tags: []`, `needLabel` = `"Not in catalog: "` + the 2 most
  frequent `needLabel`s among them (ties: alphabetical), joined by `", "` (e.g. `"Not in catalog: Dog food, Dog bed"`).
- **Order:** with a specific `shopId`: all `listing_gap`s first, then `assortment_gap`s; inside each group
  `thisWeek` descending. With `shopId=all`: `thisWeek` descending only. Return the top 8 after sorting.
- **`appliedFix`:** non-null when the selected shop has a product in the gap's `category` that carries every tag of
  the gap AND has `updatedForDemandAt != null`. Then the gap stays a `listing_gap` (not reclassified, not hidden) and
  `appliedFix = { productId, title, appliedAt: updatedForDemandAt }`. It survives page reloads. Otherwise `null`
  (always `null` for `shopId=all` and for assortment gaps). Undo clears `updatedForDemandAt`, so the gap returns to
  its normal unfixed state; Undo must work at any time, not only right after Apply.

`POST /api/seller/enrichment/preview` `{ productId, gapKey }` →
`{ proposalId, before: Product, after: Product, added: { titleSuffix: string, tags: string[], attributes: Record<string,string>, descriptionAppend: string }, kept: { title: string, tags: string[] }, keywordCheck: { keyword: string, stillMatches: boolean }[], evidence: string }`

`POST /api/seller/enrichment/apply` `{ proposalId }` → `{ product: Product }`
**`proposalId` is a signed, self-contained token** (`base64url(JSON{productId,before,after,createdAt})` + `.` +
HMAC-SHA256 with a server secret: `KITLY_PROPOSAL_SECRET`, else `SUPABASE_SERVICE_ROLE_KEY`). Never keep proposals in
process memory: on Vercel, preview and apply land on different instances (rehearsal 28/10: Apply always 404'd).
Bad signature / expired (30 min) → 404; listing already equals `after` → 404 (used); listing changed → 409.
`POST /api/seller/enrichment/undo` `{ productId }` → `{ product: Product }` (404 if nothing to undo)

### Full mode only
`POST /api/demand/watch` `{ gapKey }` → `{ watchers: number }`

## 4. Fixtures (ticket 00)

`src/contract/fixtures/` holds a mini dataset that satisfies every type: 6 shops, ~30 products (incl. the
planted hero backpack listing gap from DATA.md §4), 5 vouchers, ~60 demand rows, plus a recorded sample of
each SSE stream (`kit.sample.json` = array of `{event, data}`; `kit.clarify.sample.json` = a stream ending in `clarify`)
so Lane 2 can render the Kitly screen before the real pipeline exists (`NEXT_PUBLIC_KITLY_MOCK=1` replays it with 300 ms
gaps), plus `threads.sample.json` (2 threads; one with 2 versions incl. a refine diff, one `awaiting_budget`) and one
`BasketOption` with `status: "over_budget"`, `overBy` and two `fit` suggestions, and a `noMatch` row whose `closest` is
`prod-minhan-backpack` with `missingTags: ["anti-hunchback"]`. In mock mode the edit endpoints are replaced by a
client-side fake that returns these fixtures.
Personalisation fixtures (D39–D46): persona `lan` exactly as DATA.md §7 (+ its 2 wallet vouchers and
`prod-kidzone-lite-backpack`); `kit.sample.json` is a Lan run: its Balanced option has an `interests` entry for the
backpack (KidZone Lite 520.000₫ → 440.000₫ with `LAN-KZ80`, `overMaxPriceBy` 40.000), a `wallet: true` saving, and a
`followup` event (deadline_soon question + a swap suggestion); `kit.answer.sample.json` = an answer turn stream;
`threads.sample.json` includes one `KitMessage`.
