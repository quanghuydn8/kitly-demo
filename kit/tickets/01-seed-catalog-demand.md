# 01 — Seed: catalog, vouchers, demand history (Supabase)

**Lane:** 1 · **Target:** 10:35–11:30 · **Blocked by:** 00

**What to build:** `npm run seed` fills Supabase with the DATA.md world (25 shops, ~360 products, 8 vouchers,
~1,500 demand sessions) including every planted fact, and the Supabase adapter serves it. Store pages on the
deployed app now show the real catalog.

## Lean
- [ ] All tables live in schema `KITLY_DB_SCHEMA` (default `public`), see AGENTS.md.
- [ ] `npm run db:migrate` applies `supabase/migrations/*.sql` via `pg` + `SUPABASE_DB_URL` (idempotent: `drop table if exists` **only the Kitly tables listed in DATA.md §6**, then create. NEVER drop/reset a schema or touch any other table — the database may be shared).
- [ ] `SupabaseAdapter` implementing every `CommerceAdapter` method; `KITLY_ADAPTER=supabase` on Vercel.
- [ ] Catalog generator: fast model, one call per category with a JSON schema (titles, descriptions with concrete specs, tags only from the canonical list); runs categories in parallel (max 8 concurrent); caches raw output to `scripts/.cache/` (gitignored) so re-runs are free.
- [ ] Code then **overwrites/inserts planted products** (DATA.md §4) and enforces shop assignments (DATA.md §2).
- [ ] Demand history generator in pure code (DATA.md §5) with exact forced counts; `matchedCount` computed by a simple category+tags count (ticket 03's Matcher can replace it later).
- [ ] Seed is idempotent (truncate only Kitly tables + reload) and prints a summary (counts per table, forced-gap counts).
- [ ] Test (memory, no LLM): demand generator produces the forced this-week/last-week counts exactly and the combo share ≥ 60%.

## Full (in addition)
- [ ] Test: SupabaseAdapter contract test suite shared with InMemoryAdapter (same tests run against both when `SUPABASE_URL` is set; skipped otherwise).
- [ ] Test: planted facts present after seed (hero backpack tags, exactly one `anti-hunchback` backpack, zero `backpack-cover`, zero `anti-blue-light`).
