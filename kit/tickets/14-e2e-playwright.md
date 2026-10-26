# 14 — Playwright e2e of the demo (FULL MODE ONLY, seam S7)

**Lane:** 2 · **Blocked by:** 13

- [ ] `npm run e2e` runs DEMO.md Beats 1–4 against `BASE_URL` (real DB, real LLM): asserts every **Expect** line that is checkable from the DOM (statuses, totals ≤ budget, gap rows, seller counts +1, badge after apply), then clicks Undo to leave the DB clean.
- [ ] Generous timeouts (LLM), one retry; screenshots on failure to `e2e/artifacts/` (gitignored).
