# 03 — Kit pipeline: Planner → Matcher → Optimizer → Explainer over SSE (seam S2)

**Lane:** 1 · **Target:** 12:15–13:15 · **Blocked by:** 01, 02

**What to build:** `POST /api/kit` streams the CONTRACT.md event sequence for a need sentence, records the
intent session and demand items, and returns honest gaps. After this, the Kitly screen (ticket 11) runs live.

## Lean
- [ ] Planner: planner model, Structured Outputs schema = `KitPlan`; category enum = taxonomy ids + null; tags enum = canonical tags; system prompt states DEMO_TODAY, VND, "use null when no category fits, never force one", "Vietnamese input → language vi".
- [ ] Matcher: per plan item `adapter.searchProducts` by category; filter in-stock, `arrivesBy = today + shipDaysMax ≤ deadline`, all `mustHaveTags` present, `price ≤ maxUnitPrice`; score (tag match, rating, log reviews, tier, price fit); reason codes for empty results.
- [ ] Optimizer from 02; Explainer streams in the plan language via the fast model (≤ 120 words, mentions savings and gaps).
- [ ] Events in order with useful `detail` strings ("Planned 9 items", "Compared 47 products from 12 shops").
- [ ] Records `intent_sessions` + one `demand_items` row per plan item with `matchedCount` and `budgetHint` (= maxUnitPrice or budget share).
- [ ] Errors from the LLM become an `error` event, never a hung stream.
- [ ] S2 test with InMemoryAdapter + FakeLLM: event order; payloads valid against zod; uncovered item → noMatch + demand row with matchedCount 0.

## Full (in addition)
- [ ] S5 Matcher tests: deadline filter, must-have tag filter, maxUnitPrice, score ordering.
- [ ] Test: `profiles` parameter returns one option per profile.
