-- Kitly schema = kit/DATA.md §6.
-- `kitly_schema` is a placeholder: `npm run db:migrate` (ticket 01) replaces it with KITLY_DB_SCHEMA (default public).
-- Only these Kitly tables may be created/dropped; never drop the schema (DB may be shared).
create schema if not exists kitly_schema;
set search_path to kitly_schema;

-- Idempotent re-run: drop ONLY the Kitly tables in child-first order, never the schema.
drop table if exists demand_watches;
drop table if exists insight_advice;
drop table if exists demand_items;
drop table if exists intent_sessions;
drop table if exists product_versions;
drop table if exists vouchers;
drop table if exists products;
drop table if exists shops;

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

grant usage on schema kitly_schema to service_role;
grant all privileges on all tables in schema kitly_schema to service_role;
grant all privileges on all sequences in schema kitly_schema to service_role;

-- Make PostgREST (supabase-js) see the new tables right away.
notify pgrst, 'reload schema';
