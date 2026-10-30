# Kitly — Data spec

All shop and product names are fictional. Prices in VND. `DEMO_TODAY = 2026-09-02` (D45: three days before the
Vietnamese school opening on Sep 5; fallback `2026-08-20` by env only — every date below is relative to DEMO_TODAY).
"This week" = the 7 days ending DEMO_TODAY, "last week" = the 7 days before that.

## 1. Taxonomy (the planner's category enum)

Each category: `id` · label · icon (lucide-react name) · colour (Tailwind 100/600 pair, by event).

| Event (colour) | Categories |
|---|---|
| `back_to_school` (amber) | `school-backpack` (backpack) · `notebooks` (notebook) · `pencils-pens` (pencil) · `pencil-case` (package) · `crayons-paints` (palette) · `water-bottle` (cup-soda) · `lunch-box` (sandwich) · `school-shoes` (footprints) · `uniform-shirt` (shirt) · `kids-raincoat` (umbrella) · `book-covers` (book) · `kids-desk-lamp` (lamp-desk) |
| `newborn` (pink) | `diapers` (baby) · `baby-bottles` (milk) · `swaddles` (blanket→`bed`) · `baby-clothes` (shirt) · `baby-bathtub` (bath) · `stroller` (baby) · `baby-carrier` (heart-handshake) · `breast-pump` (droplets) · `baby-wipes` (sparkles) · `baby-thermometer` (thermometer) |
| `first_apartment` (sky) | `rice-cooker` (cooking-pot) · `bedding-set` (bed) · `pillow` (bed-single) · `storage-boxes` (archive) · `desk-fan` (fan) · `cookware-set` (chef-hat) · `dish-rack` (utensils) · `hangers` (shirt) · `power-strip` (plug) · `curtains` (panels-top-left) |
| `camping_trip` (emerald) | `tent` (tent) · `sleeping-bag` (bed-double) · `camping-stove` (flame) · `cooler-box` (refrigerator) · `headlamp` (flashlight) · `sunscreen` (sun) · `beach-towel` (waves) · `dry-bag` (backpack) · `insect-repellent` (bug) · `folding-chair` (armchair) |
| `home_office` (indigo) | `office-chair` (armchair) · `desk` (table) · `monitor` (monitor) · `monitor-arm` (move-diagonal) · `keyboard` (keyboard) · `mouse` (mouse) · `webcam` (webcam) · `laptop-stand` (laptop) · `headset` (headphones) · `desk-lamp` (lamp) |
| `tet_gifts` (red) | `tea-gift-box` (coffee) · `dried-fruit-box` (cherry) · `wine` (wine) · `bird-nest-gift` (gift) · `cookie-tin` (cookie) · `red-envelopes` (mail) · `gift-basket` (shopping-basket) · `coffee-gift-set` (coffee) |

60 categories. If a lucide icon name does not exist, use `package`.

**Canonical tags** (planner may only use these in `mustHaveTags`/`niceToHaveTags`; products use the same
vocabulary): `anti-hunchback` `lightweight` `waterproof` `grade-1` `kids` `bpa-free` `insulated` `leak-proof`
`non-slip` `organic-cotton` `newborn-0-3m` `foldable` `compact` `quiet` `energy-saving` `ergonomic`
`adjustable` `wireless` `noise-cancelling` `uv-protection` `reef-safe` `2-person` `4-person` `gift-wrapped`
`premium` `budget` `eco-friendly` `anti-blue-light` `backpack-cover`.

## 2. Shops (25)

Mix: 6 `mall`, 8 `preferred`, 11 `regular`; `shipFee` 15,000–35,000; cities Hanoi / HCMC / Da Nang.
Each event has 2 multi-category shops that carry 6+ of its categories (so consolidation matters), plus
single-category specialists. Mandatory shops:

| id | name | tier | role in demo |
|---|---|---|---|
| `shop-minhan` | Minh An Stationery | preferred | carries 8 back-to-school categories; owns the **hero listing gap** backpack; shop voucher `MINHAN30` 30,000 off min 300,000 |
| `shop-kidzone` | KidZone Mall | mall | back-to-school + newborn, higher prices, high ratings |
| `shop-bago` | Bago Bags | regular | backpack specialist, cheap, slow shipping (6–9 days) |
| `shop-homie` | Homie Living | preferred | first-apartment multi-category |
| `shop-trailhead` | Trailhead Outdoor | mall | camping |
| `shop-deskpro` | DeskPro | preferred | home office |
| `shop-tetxinh` | Tet Xinh Gifts | regular | Tet gifts |

## 3. Catalog (~360 products)

~6 products per category, spread over at least 3 shops. **Price tiers (D34):** the generator asks for 2 budget, 2 mid and
2 premium products per category; premium products have higher rating/reviews or a mall shop, so "Saver" and "Premium"
baskets really differ. **Depth rule (code, after generation, D45):** every LLM-generated category has ≥ 5 in-stock products
that **arrive within 3 days** (`shipDaysMax ≤ 3`, so they pass the Sep 5 deadline from DEMO_TODAY), among those the most
expensive costs ≥ 2.5× the cheapest, and ≥ 1 of them in the top price third has rating ≥ 4.8 (or a mall shop); when a
check fails the seed plants code-written products (or shortens `shipDaysMax` of existing ones) to satisfy it (never with gap tags). Test: the rule holds for every LLM category. (30/10 measure: the
rehearsal seed had only 3–5 products per back-to-school category and Balanced = Premium on every budget.) Each product: title (marketplace-style, English),
description 2–4 sentences with concrete specs, price realistic for Vietnam, rating 3.8–5.0, reviewCount
5–8,000, soldCount, stock 0–500 (a few 0), shipDaysMin/Max 1–9, tags from the canonical list, 2–5 attributes.
Generation: a script calls the fast model per category with a JSON schema, then **code overwrites** the
planted products below so demo facts never depend on the LLM. Seed is idempotent (`npm run seed` truncates and
reloads).

Vouchers (8): platform `KITLY50` 50,000 off min 1,000,000; platform `FREESHIP` freeship up to 30,000 min
200,000 per shop subtotal (applies to every shop group meeting it); platform `SAVE5` 5% max 40,000 min 500,000; and 5
shop vouchers including `MINHAN30` above, `KIDZONE10` 10% max 50,000 min 400,000. Rule: at most one platform
discount voucher (fixed/percent) per order + `FREESHIP` per shop group + at most one shop voucher per shop.
These 8 are public (`ownerPersona: null`). Lan's 2 **wallet vouchers** are in §7 and follow the same rule (a wallet
platform voucher competes with public platform vouchers; a wallet shop voucher with that shop's public ones).

## 4. Planted demo facts (must exist exactly)

**Hero listing gap.** `prod-minhan-backpack`, shop `shop-minhan`:
- title `Minh An Kids Backpack New Model 2026` · category `school-backpack` · price 349,000 · rating 4.8 ·
  reviews 412 · sold 1,930 · stock 120 · ship **1–2 days** (passes the Sep 5 deadline and the "express" deadline Sep 4)
- description: *"Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only
  0.75 kg. Water-resistant fabric. Sized for children aged 6–8."*
- tags `["kids"]` only, attributes `{ "material": "polyester" }` — **missing** `anti-hunchback`, `lightweight`,
  `grade-1`, `waterproof` although the description supports them.

**Other backpacks.** Exactly one product tagged `anti-hunchback`: `KidZone Ergo Spine-Care Backpack`, 890,000,
mall, ship 1–2 days. Three cheap untagged backpacks at Bago Bags (150–250k, ship 6–9 days). Two mid-range
backpacks tagged `kids` `lightweight`: one at 420,000 (ship 2–3 days, any shop but KidZone) and
**`prod-kidzone-lite-backpack`** = `KidZone Lite Backpack Grade 1–3`, shop `shop-kidzone`, 520,000, rating 4.9,
reviews 860, sold 2,400, stock 40, ship 1–2 days, tags `kids` `lightweight` `grade-1` (NOT `anti-hunchback`), attributes
`{ "weight": "0.6 kg", "age": "6-9" }`. It is the product in Lan's cart (§7).
→ Before enrichment the hero query (DEMO.md) cannot get an anti-hunchback backpack within its budget.
→ After enrichment `prod-minhan-backpack` matches and wins.
→ **Closest (D27) before enrichment:** relaxing `anti-hunchback` (but keeping ≤ 400k and the Sep 5 deadline) leaves
exactly one backpack: `prod-minhan-backpack`. So Beat 1 shows *"No exact match — closest: Minh An Kids Backpack New
Model 2026, 349.000₫, missing: anti-hunchback"* and Beat 4 shows the same product as an exact match with the badge.

**Hero assortment gap.** `kids-raincoat` with tag `backpack-cover`: zero products carry `backpack-cover`
(4 plain kids raincoats exist).

**Second assortment gap.** `kids-desk-lamp` with `anti-blue-light`: zero products.

**Coverage hole.** No pet category exists: "I'm adopting a puppy" must produce `category: null` items.

**Coverage fill.** The generated catalog must not leave unintended holes. Exactly four planted gaps may ever
show "No suitable product" for the demo event queries: (1) anti-hunchback backpack ≤ 400k, (2) `kids-raincoat` +
`backpack-cover`, (3) `kids-desk-lamp` + `anti-blue-light`, (4) pet items (no category). Anything else is a bug in
the seed. To guarantee it, the seed also plants extra products (code-written, like the planted ones above) for every
need that the probe run finds uncovered. Probe: run the 6 event queries (one per non-`other` event) through
the Planner + Matcher and list every plan item whose result is "No suitable product" but is not one of the four
planted gaps; add a planted product for each (right category, tags the Planner asked for, price within the item's
`maxUnitPrice`, in stock, ships in time for the deadline). Planted extras never carry `anti-hunchback` on a
≤ 400k backpack, never carry `backpack-cover`/`anti-blue-light`, and never create a pet category.

Probe 28/10 result (12 sentences, 6 events, VI + EN): after the Planner fix (F1) the only unintended hole was
**delivery time** — "camping trip this weekend" had no product shipping within 2 days in any camping category. Rule
(code, in the catalog generator): **every LLM-generated category has ≥ 1 in-stock product with `shipDaysMax ≤ 2`**;
if none, the best-rated in-stock product becomes ship 1–2 days. The 2 fully planted categories (school-backpack,
kids-raincoat) are unchanged, and the rule never adds gap tags. Test: for every LLM category an express product exists.

## 5. Demand history (seed, ~1,500 sessions over 28 days before DEMO_TODAY)

Generated by **code** (no LLM): per event, template plans (6–10 items each) sampled with noise; budget hints
drawn from event-specific ranges; `matchedCount` computed against the seeded catalog with the same Matcher.
Volume per event per week ≈ back_to_school 160 (rising: this week ×1.5 vs last week, the run-up to Sep 5), newborn 60,
first_apartment 70, camping_trip 50, home_office 40, tet_gifts 10.

Forced counts (code adds/removes rows to hit them exactly):

| need (category + tags) | this week | last week | budget hint p25–p75 |
|---|---|---|---|
| `school-backpack` + `anti-hunchback` | 37 | 21 | 300,000–400,000 |
| `kids-raincoat` + `backpack-cover` | 52 | 30 | 120,000–180,000 |
| `kids-desk-lamp` + `anti-blue-light` | 18 | 15 | 250,000–400,000 |
| pet items (`category: null`) | 9 | 4 | — |

Counting rules: every count above is **distinct sessions**, not rows. Pet items (`category: null`) are seeded
across 9 distinct sessions this week, 4 last week, with varied `needLabel`s (e.g. "Dog food", "Dog bed", "Dog leash")
so the grouped "Not in catalog" gap gets its label from the 2 most common. **Live `POST /api/kit` records demand
items (the hero live query makes `anti-hunchback` 37 + 1 = 38). `POST /api/kit/refine` records an intent session
but NO demand items**, so refining never changes any count.

Combos: in back_to_school sessions, `school-backpack` + `water-bottle` + `lunch-box` co-occur in ≥ 60%.

## 6. Schema (Postgres / Supabase)

```sql
create table shops (id text primary key, name text not null, tier text not null, rating numeric not null,
  ship_fee int not null, city text not null);
create table products (id text primary key, shop_id text references shops(id), title text not null,
  category text not null, description text not null, price int not null, rating numeric not null,
  review_count int not null, sold_count int not null, stock int not null, tags text[] not null default '{}',
  attributes jsonb not null default '{}', ship_days_min int not null, ship_days_max int not null,
  updated_for_demand_at timestamptz);
create table product_versions (id bigserial primary key, product_id text references products(id),
  snapshot jsonb not null, created_at timestamptz default now());
create table vouchers (id text primary key, scope text not null, shop_id text references shops(id),
  code text not null, kind text not null, value int not null, max_discount int, min_spend int not null,
  valid_until date not null, owner_persona text, label text not null);   -- owner_persona null = public (D46)
create table personas (id text primary key, name text not null, district text, city text,
  favorite_shop_ids text[] not null default '{}', cart jsonb not null default '[]');   -- D39, only 'lan' is stored
create table intent_sessions (id uuid primary key default gen_random_uuid(), query text not null,
  event text not null, language text not null, plan jsonb not null, source text not null,
  created_at timestamptz not null default now());
create table demand_items (id bigserial primary key, session_id uuid references intent_sessions(id) on delete cascade,
  event text not null, need_label text not null, category text, tags text[] not null default '{}',
  matched_count int not null, budget_hint int, created_at timestamptz not null);
create table insight_advice (gap_key text primary key, counts_signature text not null, advice text not null);
create table demand_watches (id bigserial primary key, gap_key text not null, created_at timestamptz default now()); -- Full
create table kit_threads (id uuid primary key default gen_random_uuid(), owner text not null, title text not null,
  persona text not null default 'lan',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table kit_versions (id bigserial primary key, thread_id uuid not null references kit_threads(id) on delete cascade,
  version int not null, kind text not null, user_text text not null, plan jsonb not null,
  excluded_keys text[] not null default '{}', status text not null, options jsonb not null default '[]',
  explanation text not null default '', diff jsonb, selection jsonb, follow_up jsonb,
  created_at timestamptz not null default now(), unique (thread_id, version));
create table kit_messages (id bigserial primary key, thread_id uuid not null references kit_threads(id) on delete cascade,
  after_version int not null, user_text text not null, answer text not null, follow_up jsonb,
  created_at timestamptz not null default now());                                    -- D42 answer turns
create index on kit_threads (owner, updated_at desc);
create index on demand_items (created_at); create index on products (category);
```

All tables are created in schema `KITLY_DB_SCHEMA` (default `public`; the rehearsal uses `kitly_lean` / `kitly_full`).
Live sessions are timestamped `DEMO_TODAY` + current time-of-day so they land in "this week".
RLS: disabled for the demo (server uses the service-role key; the key never reaches the browser).

## 7. Demo buyer persona (D39, planted by code, never by the LLM)

| field | value |
|---|---|
| id / name | `lan` / `Lan` |
| address | district `Cau Giay`, city `Hanoi` (display + AI context only, D44) |
| favoriteShopIds | `["shop-kidzone"]` |
| cart | `[{ productId: "prod-kidzone-lite-backpack", addedAt: DEMO_TODAY − 14 days }]` |

Wallet vouchers (`owner_persona = 'lan'`):

| code | scope | kind | value | max | min spend | valid until | label |
|---|---|---|---|---|---|---|---|
| `LAN-KZ80` | shop `shop-kidzone` | fixed | 80,000 | — | 400,000 | DEMO_TODAY + 28 days | KidZone 80k off |
| `LAN-BTS10` | platform | percent | 10 | 100,000 | 500,000 | **DEMO_TODAY + 2 days** | Back-to-school 10% |

What this makes true in the demo (tests in ticket 16): the hero kit for Lan shows the 💛 card *KidZone Lite Backpack ·
520.000₫ → 440.000₫ with LAN-KZ80 · over your 400k limit by 40.000₫*; `LAN-BTS10` beats `SAVE5`/`KITLY50` whenever the
basket is ≥ 500,000 (saving line "Your wallet voucher Back-to-school 10%"), so the same sentence as **Guest** costs more;
SalesContext hooks for the hero kit = `deadline_soon` (3 days to Sep 5), `cart_interest`, `voucher_expiring` (LAN-BTS10, 2 days).
