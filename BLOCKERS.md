# BLOCKERS

One line per blocker: `T<NN> | lane | what is missing | who can unblock`.

T10 | 2 | (non-blocking, worked around) vitest cannot transform JSX (tsconfig `jsx: preserve`) and there is no jsdom/@testing-library: please add `@testing-library/react` + `jsdom` devDeps, `oxc/esbuild jsx: "automatic"` and `tests/**/*.test.tsx` to vitest.config.ts — then Lane 2 deletes `src/components/tsconfig.json` (current workaround) | Lane 1
T13 | 2 | (non-blocking) DEMO Beat 4 live re-run came back over_budget (min 1.707.000₫): the planner varied quantities between identical runs (Grade 1 query → 10 notebooks + "Book and notebook covers ×15" = 330k). Beat 1 run of the same text planned 1 cover pack and was ok at 1.430.000₫. Planner prompt should keep pack-type items at qty 1 / stay stable for the same query | Lane 1 (T03)
T13 | 2 | (non-blocking) /api/kit/refine logs a fresh demand session, so one Beat 1 + Beat 2 pass adds 2 to the backpack gap (DEMO.md Beat 3 expects 38 = 37 + "the live query") — either refine should not log demand, or DEMO.md should say 39 | Lane 1 (T04) / DEMO owner
T13 | 2 | (non-blocking) `.playwright-mcp/` still not in .gitignore (browser-smoke artifacts land in the repo root); favicon.ico 404 on every page (src/app root is not Lane 2) | Lane 1
