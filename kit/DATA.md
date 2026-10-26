# Kitly — Data spec

All shop and product names are fictional. Prices in VND. `DEMO_TODAY = 2026-08-20`.
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

~6 products per category, spread over at least 3 shops. Each product: title (marketplace-style, English),
description 2–4 sentences with concrete specs, price realistic for Vietnam, rating 3.8–5.0, reviewCount
5–8,000, soldCount, stock 0–500 (a few 0), shipDaysMin/Max 1–9, tags from the canonical list, 2–5 attributes.
Generation: a script calls the fast model per category with a JSON schema, then **code overwrites** the
planted products below so demo facts never depend on the LLM. Seed is idempotent (`npm run seed` truncates and
reloads).

Vouchers (8): platform `KITLY50` 50,000 off min 1,000,000; platform `FREESHIP` freeship up to 30,000 min
200,000 per shop subtotal (applies to every shop group meeting it); platform `SAVE5` 5% max 40,000 min 500,000; and 5
shop vouchers including `MINHAN30` above, `KIDZONE10` 10% max 50,000 min 400,000. Rule: at most one platform
discount voucher (fixed/percent) per order + `FREESHIP` per shop group + at most one shop voucher per shop.

## 4. Planted demo facts (must exist exactly)

**Hero listing gap.** `prod-minhan-backpack`, shop `shop-minhan`:
- title `Minh An Kids Backpack New Model 2026` · category `school-backpack` · price 349,000 · rating 4.8 ·
  reviews 412 · sold 1,930 · stock 120 · ship 2–3 days
- description: *"Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only
  0.75 kg. Water-resistant fabric. Sized for children aged 6–8."*
- tags `["kids"]` only, attributes `{ "material": "polyester" }` — **missing** `anti-hunchback`, `lightweight`,
  `grade-1`, `waterproof` although the description supports them.

**Other backpacks.** Exactly one product tagged `anti-hunchback`: `KidZone Ergo Spine-Care Backpack`, 890,000,
mall, ship 2–4 days. Three cheap untagged backpacks at Bago Bags (150–250k, ship 6–9 days). Two mid-range
backpacks (420–520k) tagged `kids` `lightweight`.
→ Before enrichment the hero query (DEMO.md) cannot get an anti-hunchback backpack within its budget.
→ After enrichment `prod-minhan-backpack` matches and wins.

**Hero assortment gap.** `kids-raincoat` with tag `backpack-cover`: zero products carry `backpack-cover`
(4 plain kids raincoats exist).

**Second assortment gap.** `kids-desk-lamp` with `anti-blue-light`: zero products.

**Coverage hole.** No pet category exists: "I'm adopting a puppy" must produce `category: null` items.

## 5. Demand history (seed, ~1,500 sessions over 28 days before DEMO_TODAY)

Generated by **code** (no LLM): per event, template plans (6–10 items each) sampled with noise; budget hints
drawn from event-specific ranges; `matchedCount` computed against the seeded catalog with the same Matcher.
Volume per event per week ≈ back_to_school 160 (rising: this week ×1.5 vs last week, August), newborn 60,
first_apartment 70, camping_trip 50, home_office 40, tet_gifts 10.

Forced counts (code adds/removes rows to hit them exactly):

| need (category + tags) | this week | last week | budget hint p25–p75 |
|---|---|---|---|
| `school-backpack` + `anti-hunchback` | 37 | 21 | 300,000–400,000 |
| `kids-raincoat` + `backpack-cover` | 52 | 30 | 120,000–180,000 |
| `kids-desk-lamp` + `anti-blue-light` | 18 | 15 | 250,000–400,000 |
| pet items (`category: null`) | 9 | 4 | — |

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
  valid_until date not null);
create table intent_sessions (id uuid primary key default gen_random_uuid(), query text not null,
  event text not null, language text not null, plan jsonb not null, source text not null,
  created_at timestamptz not null default now());
create table demand_items (id bigserial primary key, session_id uuid references intent_sessions(id) on delete cascade,
  event text not null, need_label text not null, category text, tags text[] not null default '{}',
  matched_count int not null, budget_hint int, created_at timestamptz not null);
create table insight_advice (gap_key text primary key, counts_signature text not null, advice text not null);
create table demand_watches (id bigserial primary key, gap_key text not null, created_at timestamptz default now()); -- Full
create index on demand_items (created_at); create index on products (category);
```

All tables are created in schema `KITLY_DB_SCHEMA` (default `public`; the rehearsal uses `kitly_lean` / `kitly_full`).
Live sessions are timestamped `DEMO_TODAY` + current time-of-day so they land in "this week".
RLS: disabled for the demo (server uses the service-role key; the key never reaches the browser).
