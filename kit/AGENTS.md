# AGENTS.md — rules for the coding agent (Codex / Claude)

You are building **Kitly** (read `kit/PRD.md`, then `kit/CONTRACT.md`, `kit/DATA.md`, `kit/DEMO.md`).
You will be given ONE ticket from `kit/tickets/` per run, plus a **lane** and a **mode**.

## Mode
- `lean`: do the ticket's **Lean** acceptance criteria only. Tests only at the seams the ticket names.
- `full`: do **Lean + Full** criteria. Test-first for every module the ticket touches.
Never do work from another ticket. If something you need is missing, write it in `BLOCKERS.md` and stop.

## Lanes and folder ownership
| Lane | Owns (may create/edit) |
|---|---|
| 1 Backend/AI/Data | `src/server/**`, `src/app/api/**`, `scripts/**`, `supabase/**`, `tests/server/**`, `package.json`, config files |
| 2 Frontend | `src/app/(store)/**`, `src/app/kit/**`, `src/app/seller/**`, `src/components/**`, `src/lib/client/**`, `tests/ui/**`, `e2e/**` |
| shared | `src/contract/**` is created in ticket 00 and then **frozen**; only Lane 1 changes it, in a commit titled `contract: …` |
Lane 2 needs a dependency → add a line to `BLOCKERS.md`, do not edit `package.json`.

## How to work
1. `git pull --rebase` before starting.
2. Test-first at the seams named in the ticket: write the failing test, run it, see it fail, implement, see it pass.
   The only fakes allowed: the LLM client (`FakeLLM`) and the `InMemoryAdapter`. Never mock our own modules.
3. Before every commit: `npm test` green **and** `npm run build` succeeds. Never `--no-verify`.
4. Commit message: `T<NN>: <what works now>`. Push right away (`git pull --rebase && git push`).
5. Append one line to `CODEX_LOG.md`: `T<NN> | lane | mode | what was built | tests added | notes`.
6. Final message of your run: what works, test count, anything left (or "none").

## Conventions
- TypeScript strict. Money = integer VND; format with `Intl.NumberFormat("vi-VN")` + `₫`.
- All LLM calls go through `src/server/llm/` (one client, Structured Outputs, model from env). Never call OpenAI elsewhere.
- The client must honour `OPENAI_BASE_URL` (OpenAI-compatible proxies are used in rehearsal). For streaming use
  `responses.create({ ..., stream: true })` and iterate the raw events (`response.output_text.delta`); do NOT use the
  SDK's `responses.stream()` helper (it breaks on proxies that rewrite response ids).
- All marketplace data goes through the `CommerceAdapter`. Kitly modules never import Supabase.
- "Today" = `DEMO_TODAY` env (default `2026-08-20`), via one helper. Never `new Date()` for business logic.
- Secrets only in env (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); never in the client bundle, never committed.
- UI: English chrome, Tailwind, lucide-react icons, no images. Clean marketplace look (white, rounded cards, orange accent `#EE4D2D`-ish is fine but do NOT use any real marketplace's logo or name).
- Every SQL statement and the supabase-js client (`db: { schema }`) use `KITLY_DB_SCHEMA`. The migration starts with
  `create schema if not exists <schema>` and grants usage + all privileges on its tables/sequences to `service_role`.
- Database may be shared with other apps: only create/alter/drop/truncate the tables listed in `kit/DATA.md` §6. Never `drop schema`, never touch other tables.
- Keep files small; prefer one module per concept named in the PRD.

## Env
```
OPENAI_API_KEY=            OPENAI_BASE_URL=   # empty = official OpenAI
KITLY_MODEL_PLANNER=gpt-6.1-sol
KITLY_MODEL_FAST=gpt-6-luna
SUPABASE_URL=              SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=           # Postgres connection string, used only by npm run db:migrate / seed
KITLY_ADAPTER=supabase     # or memory
KITLY_DB_SCHEMA=public     # Postgres schema for every Kitly table (rehearsal uses kitly_lean / kitly_full)
DEMO_TODAY=2026-08-20
NEXT_PUBLIC_KITLY_MOCK=0   # 1 = Kitly screen replays src/contract/fixtures/kit.sample.json
```

## Commands
`npm run dev` · `npm test` · `npm run build` · `npm run db:migrate` + `npm run seed` (Lane 1, ticket 01) · `npm run e2e` (full) · `npm run eval` (full)
