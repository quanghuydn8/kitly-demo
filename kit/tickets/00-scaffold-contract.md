# 00 — Scaffold, contract, adapter, deploy skeleton

**Lane:** 1 (Lane 2 waits for this push) · **Target:** 10:00–10:35 · **Blocked by:** None — start immediately

**What to build:** an empty-but-real Kitly app: Next.js + TS + Tailwind + Vitest repo, the contract from
CONTRACT.md as code, the In-memory adapter on fixtures, the LLM client wrapper, thin store endpoints, a
Supabase migration file, deployed to Vercel. After this, both lanes can work in parallel.

## Lean
- [ ] Next.js App Router + TypeScript strict + Tailwind + lucide-react + zod + openai + @supabase/supabase-js + Vitest; scripts `dev`, `build`, `test`.
- [ ] `src/contract/`: every type in CONTRACT.md §1–3 as TS types **and** zod schemas (SSE event payloads included); taxonomy + tags + icons/colours from DATA.md §1 as a constant.
- [ ] `src/contract/fixtures/`: mini dataset per CONTRACT.md §4 (must include `prod-minhan-backpack` exactly as DATA.md §4) and `kit.sample.json` (a realistic recorded SSE stream for the DEMO.md Beat 1 query, ending with `done`).
- [ ] `CommerceAdapter` interface + `InMemoryAdapter` (loads fixtures; `updateListing` snapshots, `undoListing` restores) + a `getAdapter()` factory reading `KITLY_ADAPTER` (Supabase impl may throw "not implemented" until 01).
- [ ] `src/server/llm/`: one OpenAI client (reads `OPENAI_BASE_URL`; streaming via `responses.create({stream:true})` raw events, never the `.stream()` helper) wrapper `structured<T>(model, schema, messages)` + `stream(model, messages)`, and `FakeLLM` for tests.
- [ ] `today()` helper reading `DEMO_TODAY`.
- [ ] Store endpoints over the adapter: `GET /api/products`, `/api/products/:id`, `/api/shops`, `/api/categories`, `POST /api/checkout` (CONTRACT.md §3).
- [ ] `supabase/migrations/0001_init.sql` = DATA.md §6.
- [ ] `.env.example`, `BLOCKERS.md`, `CODEX_LOG.md`, README with "built during the hackathon" + link to `kit/`.
- [ ] Test: contract fixtures parse with the zod schemas; `InMemoryAdapter` update→undo round-trip.
- [ ] Deployed to Vercel (memory adapter) and the URL is in README.

## Full (in addition)
- [ ] Tests for every store endpoint (status + schema) through the route handlers.
- [ ] Prettier + ESLint configured, `npm run lint` clean.
