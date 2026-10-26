# Kitly on DemoMart

> Tell Kitly your need, get the whole kit. Sellers see which kits are missing.

**Built during the hackathon** (Sea x OpenAI Codex Hackathon, 31 Oct 2026). The planning kit prepared
beforehand (docs only, no code) is in [`kit/`](kit/): [PRD](kit/PRD.md), [CONTRACT](kit/CONTRACT.md),
[DATA](kit/DATA.md), [DEMO](kit/DEMO.md). Which tickets the agent built: [CODEX_LOG.md](CODEX_LOG.md).

**Live URL:** _not deployed yet (rehearsal: Vercel step skipped, verified with `npm run build`)._

## Run

```bash
cp .env.example .env.local   # KITLY_ADAPTER=memory works with no database
npm install
npm run dev                  # http://localhost:3000
npm test                     # Vitest
npm run build
npm run lint
```

## Layout

| Path | What |
|---|---|
| `src/contract/` | Shared types + zod schemas + taxonomy + fixtures (frozen after T00) |
| `src/server/adapter/` | `CommerceAdapter` implementations + `getAdapter()` (`KITLY_ADAPTER`) |
| `src/server/llm/` | The only OpenAI client (`structured`, `stream`) + `FakeLLM` |
| `src/server/today.ts` | `today()` from `DEMO_TODAY` |
| `src/app/api/` | Route handlers (store endpoints now; Kitly + seller later) |
| `supabase/migrations/` | Postgres schema (DATA.md §6) |
| `scripts/gen-fixtures.mjs` | Regenerates the mini fixture dataset |
