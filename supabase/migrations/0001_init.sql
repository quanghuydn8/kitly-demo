-- Kitly schema = kit/DATA.md §6. Every object lives in schema __KITLY_SCHEMA__, which the migration runner
-- (npm run db:migrate, ticket 01) replaces with KITLY_DB_SCHEMA (validated identifier, default public).
-- Only the Kitly tables below may be created/dropped; never drop the schema or touch other tables (shared DB).
create schema if not exists __KITLY_SCHEMA__;

create table __KITLY_SCHEMA__.shops (id text primary key, name text not null, tier text not null, rating numeric not null,
  ship_fee int not null, city text not null);
create table __KITLY_SCHEMA__.products (id text primary key, shop_id text references __KITLY_SCHEMA__.shops(id), title text not null,
  category text not null, description text not null, price int not null, rating numeric not null,
  review_count int not null, sold_count int not null, stock int not null, tags text[] not null default '{}',
  attributes jsonb not null default '{}', ship_days_min int not null, ship_days_max int not null,
  updated_for_demand_at timestamptz);
create table __KITLY_SCHEMA__.product_versions (id bigserial primary key, product_id text references __KITLY_SCHEMA__.products(id),
  snapshot jsonb not null, created_at timestamptz default now());
create table __KITLY_SCHEMA__.vouchers (id text primary key, scope text not null, shop_id text references __KITLY_SCHEMA__.shops(id),
  code text not null, kind text not null, value int not null, max_discount int, min_spend int not null,
  valid_until date not null, owner_persona text, label text not null);   -- owner_persona null = public (D46)
create table __KITLY_SCHEMA__.personas (id text primary key, name text not null, district text, city text,
  favorite_shop_ids text[] not null default '{}', cart jsonb not null default '[]');   -- D39, only 'lan' is stored
create table __KITLY_SCHEMA__.intent_sessions (id uuid primary key default gen_random_uuid(), query text not null,
  event text not null, language text not null, plan jsonb not null, source text not null,
  created_at timestamptz not null default now());
create table __KITLY_SCHEMA__.demand_items (id bigserial primary key, session_id uuid references __KITLY_SCHEMA__.intent_sessions(id) on delete cascade,
  event text not null, need_label text not null, category text, tags text[] not null default '{}',
  matched_count int not null, budget_hint int, created_at timestamptz not null);
create table __KITLY_SCHEMA__.insight_advice (gap_key text primary key, counts_signature text not null, advice text not null);
create table __KITLY_SCHEMA__.demand_watches (id bigserial primary key, gap_key text not null, created_at timestamptz default now()); -- Full
create table __KITLY_SCHEMA__.kit_threads (id uuid primary key default gen_random_uuid(), owner text not null, title text not null,
  persona text not null default 'lan',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table __KITLY_SCHEMA__.kit_versions (id bigserial primary key, thread_id uuid not null references __KITLY_SCHEMA__.kit_threads(id) on delete cascade,
  version int not null, kind text not null, user_text text not null, plan jsonb not null,
  excluded_keys text[] not null default '{}', status text not null, options jsonb not null default '[]',
  explanation text not null default '', diff jsonb, selection jsonb, follow_up jsonb,
  created_at timestamptz not null default now(), unique (thread_id, version));
create table __KITLY_SCHEMA__.kit_messages (id bigserial primary key, thread_id uuid not null references __KITLY_SCHEMA__.kit_threads(id) on delete cascade,
  after_version int not null, user_text text not null, answer text not null, follow_up jsonb,
  created_at timestamptz not null default now());                                    -- D42 answer turns
create index kit_threads_owner_updated_idx on __KITLY_SCHEMA__.kit_threads (owner, updated_at desc);
create index demand_items_created_at_idx on __KITLY_SCHEMA__.demand_items (created_at);
create index products_category_idx on __KITLY_SCHEMA__.products (category);

grant usage on schema __KITLY_SCHEMA__ to service_role;
grant all privileges on all tables in schema __KITLY_SCHEMA__ to service_role;
grant all privileges on all sequences in schema __KITLY_SCHEMA__ to service_role;
