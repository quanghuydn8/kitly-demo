# 14 — Playwright e2e of the demo (FULL MODE ONLY, seam S7)

**Lane:** 2 · **Blocked by:** 13, 15, 17

- [ ] Tooling already exists from ticket 00 (`e2e` script, `@playwright/test`, jsdom/testing-library, `.gitignore` entries). **Do not add or edit these**; if something is missing, write it in `BLOCKERS.md`.
- [ ] `npm run e2e` runs DEMO.md Beats 1–4 against `BASE_URL` (real DB, real LLM): asserts every **Expect** line that is checkable from the DOM (statuses, totals ≤ budget, closest backpack row, version 2 after refine, live strip shows the Beat 1 need, seller counts +1, badge after apply), then clicks Undo to leave the DB clean.
- [ ] Reload test: after Beat 2, `page.reload()` still shows the latest version and every chat turn (incl. the answer turn).
- [ ] Personalisation (D39–D46): Beat 1 shows the 💛 KidZone Lite card with 440.000₫ and the wallet saving line; the assistant message ends with a "?" and ≥ 2 quick replies; the Beat 2 question keeps "Version 1 of 1"; a Guest run of the Beat 1 sentence shows no 💛 card and a higher Balanced total. Leave the persona cookie on Lan at the end.
- [ ] **Speed check:** measure Run → first basket line visible for the hero sentence; log it; fail when > 20 s (target ≤ 10 s, D36).
- [ ] Generous timeouts (LLM), one retry; screenshots on failure to `e2e/artifacts/` (gitignored).
