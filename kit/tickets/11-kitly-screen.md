# 11 — Kitly screen: need → timeline → plan → basket → refine

**Lane:** 2 · **Target:** 11:45–13:30 · **Blocked by:** 00 (uses `NEXT_PUBLIC_KITLY_MOCK=1` until ticket 03 is pushed, then switch to live)

**What to build:** `/kit` — the hero screen of the demo.

## Lean
- [ ] Big need input (prefilled from `?q=`), Run button, example chips (one per event).
- [ ] SSE client (fetch + ReadableStream parser for POST) in `src/lib/client/`.
- [ ] Left: **timeline** of steps (spinner → check, detail text), appears instantly.
- [ ] Plan card: event, budget, deadline, assumptions, items with must-have/nice-to-have chips and tags.
- [ ] Basket: one row per plan item: chosen product (mini card), reason, quantity, line total, "2 alternatives" expander with swap (client-side recompute of totals is fine); `noMatch` rows styled as honest gaps "No suitable product yet: <reason>"; "Skipped for budget" section.
- [ ] Totals panel: items, shipping, discounts, grand total vs budget bar; savings lines; status `over_budget` banner with minimum cost + drivers.
- [ ] Explanation panel renders streamed text.
- [ ] Refine box under the basket → `/api/kit/refine`; diff chips (added / removed / changed) highlighted on rows.
- [ ] "Add kit to cart" → cart (ticket 10) → checkout.
- [ ] `error` event shows inline in the timeline with Retry.
- [ ] Handles `options.length > 1` by rendering tabs (3-column view is ticket 20b).

## Full (in addition)
- [ ] Unit test for the SSE parser (chunk boundaries, multi-line data).
- [ ] Component test: noMatch row and over_budget banner render from fixture payloads.
