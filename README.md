# Kitly on DemoMart

> Tell Kitly your need, get the whole kit. Sellers see which kits are missing.

**Built during the hackathon** (Sea x OpenAI Codex Hackathon, 31 Oct 2026). The planning kit prepared beforehand
(docs only, no code) is in [`kit/`](kit/): [PRD](kit/PRD.md) · [Contract](kit/CONTRACT.md) · [Data](kit/DATA.md) ·
[Demo script](kit/DEMO.md). Agent rules: [AGENTS.md](AGENTS.md). Build log: [CODEX_LOG.md](CODEX_LOG.md).

**Deployed URL:** _not deployed yet_ (rehearsal run: Vercel deploy skipped; verified with `npm run build`).

## Run locally
```bash
cp .env.example .env.local     # fill in keys; KITLY_ADAPTER=memory runs on the built-in fixtures
npm install
npm run dev                    # http://localhost:3000
npm test                       # Vitest (server + ui projects)
npm run build
npm run lint
npm run db:migrate             # Supabase: (re)create the Kitly tables in KITLY_DB_SCHEMA via SUPABASE_DB_URL
npm run seed                   # DemoMart world: 25 shops, ~360 products (LLM, cached in scripts/.cache/), demand history
npm run test:supabase          # same suites + the Supabase contract/planted-fact tests against the seeded DB (.env)
npm run e2e                    # Playwright against BASE_URL (browsers: npx playwright install chromium)
```

## Layout
- `src/contract/` — types + zod schemas + fixtures shared by both lanes (frozen after ticket 00; changes only in `contract: …` commits).
- `src/server/adapter/` — `CommerceAdapter` implementations (`InMemoryAdapter` on fixtures, `SupabaseAdapter` from ticket 01); `getAdapter()` switches on `KITLY_ADAPTER`.
- `src/server/kitstore/` — `KitStore` (threads / versions / answer messages); `getKitStore()`.
- `src/server/llm/` — the one LLM client (`OpenAILLM`, honours `OPENAI_BASE_URL`) + `FakeLLM` for tests.
- `src/middleware.ts` — `kitly_uid` owner cookie + optional Basic Auth (`KITLY_BASIC_AUTH=user:pass`).
- `src/server/seed/` — seed world: shops, planted facts, LLM catalog generator, depth rule, demand generator; `src/server/db/` — schema name, migration builder, pg + supabase-js clients; `scripts/` — `db:migrate`, `seed`.
- `src/app/api/` — route handlers (CONTRACT §3). `supabase/migrations/` — schema (DATA.md §6).
