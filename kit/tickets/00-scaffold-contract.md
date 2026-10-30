# 00 — Scaffold, contract, adapter, deploy skeleton

**Lane:** 1 (Lane 2 waits for this push) · **Target:** 10:00–10:35 · **Blocked by:** None — start immediately

**What to build:** an empty-but-real Kitly app: Next.js + TS + Tailwind + Vitest repo, the contract from
CONTRACT.md as code, the In-memory adapter on fixtures, the LLM client wrapper, thin store endpoints, a
Supabase migration file, deployed to Vercel. After this, both lanes can work in parallel.

## Lean
- [ ] Next.js App Router + TypeScript strict + Tailwind + lucide-react + zod + openai + @supabase/supabase-js + Vitest; scripts `dev`, `build`, `test`.
- [ ] `src/contract/`: every type in CONTRACT.md §1–3 as TS types **and** zod schemas (SSE event payloads incl. `clarify` and `followup`; `KitVersion`, `KitSelection`, `FitSuggestion`, `Closest`, adjust `change` union, threads responses incl. `messages`; `Persona`, `Interest`, `SalesContext`, `FollowUp`, `KitMessage`, persona endpoints); taxonomy + tags + icons/colours from DATA.md §1 as a constant.
- [ ] `src/contract/fixtures/`: mini dataset per CONTRACT.md §4 (must include `prod-minhan-backpack` exactly as DATA.md §4), `kit.sample.json` (a realistic recorded SSE stream for the DEMO.md Beat 1 query, ending with `done`, whose backpack `noMatch` row has `closest` = `prod-minhan-backpack`), `kit.clarify.sample.json`, `threads.sample.json`, and an over-budget option with `fit` (CONTRACT §4); persona `lan` + wallet vouchers + `prod-kidzone-lite-backpack` (DATA.md §7), the Lan-specific parts of `kit.sample.json` (`interests`, wallet saving, `followup` event) and `kit.answer.sample.json` (CONTRACT §4 "Personalisation fixtures").
- [ ] `CommerceAdapter` interface + `InMemoryAdapter` (loads fixtures; `updateListing` snapshots, `undoListing` restores; `searchProducts` accepts `categories[]`; `recentDemandItems`; `getPersona`; `listVouchers(persona)` = public + that persona's wallet) + a `getAdapter()` factory reading `KITLY_ADAPTER` (Supabase impl may throw "not implemented" until 01).
- [ ] `KitStore` interface + `InMemoryKitStore` + `getKitStore()` (same `KITLY_ADAPTER` switch) per CONTRACT §2 (incl. thread `persona` and `appendMessage`).
- [ ] `src/middleware.ts`: sets cookie `kitly_uid` (random UUID, httpOnly, SameSite=Lax, 1 year) when missing; a server helper `ownerFrom(request)` reads it; `personaFrom(request)` reads `kitly_persona` (missing/invalid ⇒ `"lan"`). (Basic Auth from Full lives in the same middleware.)
- [ ] `src/server/llm/`: one OpenAI client (reads `OPENAI_BASE_URL`; streaming via `responses.create({stream:true})` raw events, never the `.stream()` helper) wrapper `structured<T>(model, schema, messages, { effort? })` + `stream(model, messages, { effort? })` sending `reasoning: { effort }` when set, models + efforts from env (AGENTS.md), and `FakeLLM` for tests (records the effort it was called with).
- [ ] `today()` helper reading `DEMO_TODAY`.
- [ ] Store endpoints over the adapter: `GET /api/products`, `/api/products/:id`, `/api/shops`, `/api/categories`, `POST /api/checkout` (CONTRACT.md §3).
- [ ] `supabase/migrations/0001_init.sql` = DATA.md §6.
- [ ] `.env.example`, `BLOCKERS.md`, `CODEX_LOG.md`, README with "built during the hackathon" + link to `kit/`.
- [ ] Test: contract fixtures parse with the zod schemas; `listVouchers("lan")` returns the 8 public + 2 wallet vouchers and `listVouchers("guest")` only the 8 public; `InMemoryAdapter` update→undo round-trip; `InMemoryKitStore` create → append 2 versions → `getThread` returns them in order, another owner gets `null`; middleware sets `kitly_uid` once.
- [ ] Deployed to Vercel (memory adapter) and the URL is in README.

## Full (in addition)
- [ ] Tests for every store endpoint (status + schema) through the route handlers.
- [ ] Prettier + ESLint configured, `npm run lint` clean.
- [ ] Test/e2e tooling is created here so later tickets do not have to touch config:
  - `package.json` script `e2e` = `playwright test` and devDependency `@playwright/test` (browsers are installed by whoever runs e2e); a `playwright.config.ts` pointing at `e2e/` with `BASE_URL`.
  - devDependencies `jsdom` and `@testing-library/react`; `vitest.config.ts` handles `.test.tsx` (jsx transform, `environment: "jsdom"` for `tests/ui/**`).
  - `.gitignore` includes `.playwright-mcp/`, `e2e/artifacts/`, `node_modules`, `.next`, `.env*` (except `.env.example`).
  - `.vercelignore` with `.env`, `.env.*`, `!.env.example`, `e2e/artifacts/`, `scripts/.cache/` — the Vercel CLI uploads `.env` otherwise (28/10).
  - `src/middleware.ts` + `src/server/basic-auth.ts`: Basic Auth only when `KITLY_BASIC_AUTH=user:pass` is set (unit test: unset → open; wrong/missing → 401 with `WWW-Authenticate`; right → pass). e2e config passes `httpCredentials` from the same env.
  - A favicon at `src/app/icon.svg` (so the browser does not log a 404 for `/favicon.ico`).
