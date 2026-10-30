# 03 — Kit pipeline: Planner → Matcher → Optimizer → Explainer over SSE (seam S2)

**Lane:** 1 · **Target:** 12:15–13:15 · **Blocked by:** 01, 02

**What to build:** `POST /api/kit` streams the CONTRACT.md event sequence for a need sentence, creates a kit
thread (owner = `kitly_uid` cookie) and saves version 1 in the KitStore, records the intent session and demand
items, asks for the budget when it is missing, and returns honest gaps with the closest product. After this, the
Kitly screen (ticket 11) runs live.

## Lean
- [ ] Planner: planner model with `effort = KITLY_PLANNER_EFFORT` (default `low`), Structured Outputs schema = `KitPlan`; category enum = taxonomy ids + null; tags enum = canonical tags; system prompt states DEMO_TODAY, VND, "use null when no category fits, never force one", "Vietnamese input → language vi". **Dates (D45/D44):** the prompt also says "Vietnamese school year opens on Sep 5: for back_to_school without a stated date, deadline = the next Sep 5 on/after today and add the assumption 'By Sep 5 (school opening)'" and "express / hoả tốc / giao nhanh ⇒ deadline = today + 2 days"; code checks a returned deadline is a valid date ≥ today (else null).
- [ ] Matcher: ONE `adapter.searchProducts({ categories })` call for the whole plan; filter in-stock, `arrivesBy = today + shipDaysMax ≤ deadline`, all `mustHaveTags` present, `price ≤ maxUnitPrice`; **score = quality only** (CONTRACT §1 weights, no price term); reason codes for empty results.
- [ ] **Closest (D27):** an item with a category but no exact candidate gets `closest`: re-filter without `mustHaveTags` (keep max price, deadline, stock) → best score; if none, also without `maxUnitPrice` → best score with `overMaxPriceBy`; never relax deadline or stock. `missingTags` = must-have tags the product lacks. `matchedCount` and demand recording are unchanged (the need is still unmet). Test: hero fixture → backpack `noMatch.closest.candidate.product.id === "prod-minhan-backpack"` and `missingTags === ["anti-hunchback"]`; a closest product is never in `lines`.
- [ ] **Clarify (D32):** when the parsed plan has `budget === null`, emit `plan`, then `clarify` (CONTRACT §3; text in plan language), save version 1 with `status: "awaiting_budget"`, `done`. No Matcher/Optimizer/Explainer, no demand items yet. Test with FakeLLM: no-budget sentence → events `… plan, clarify, done`; the hero sentence never clarifies.
- [ ] **Thread persistence:** create the thread (title = query, ≤ 60 chars, persona = `personaFrom(request)`) on the first event; the pipeline loads `getPersona` + `listVouchers(persona)` for this thread; send `threadId`/`version` in `plan` and `done`; save the version (plan, options, full explanation text, diff null, selection null) BEFORE `done`. Demand items are recorded once per thread (CONTRACT §3). Test: after the stream, `getThread` returns version 1 with the options and explanation; another owner gets `null`.
- [ ] Planner post-processing in code (applied after parsing, regardless of what the LLM returned): (a) context tags `grade-1 kids newborn-0-3m budget premium gift-wrapped eco-friendly` are removed from every `mustHaveTags` and added to `niceToHaveTags`; (b) every `quantity` is clamped to `1..3` (also `< 1` → 1). Prompt rules: `mustHaveTags` only for attributes the buyer stated for that exact item; set/pack items (book covers, pens, notebooks, crayons, wipes, diapers…) = quantity 1; quantity > 1 only when the buyer says so or for rotation clothing (uniform = 2).
- [ ] Planner retries once automatically when structured output fails validation or the call throws a network error; the second failure becomes the `error` event (`llm_error`).
- [ ] Optimizer from 02; `options` is sent before the Explainer starts; Explainer streams in the plan language via the fast model (`effort = KITLY_FAST_EFFORT`): **≤ 70 words and ≤ 4 sentences**, mentions savings and gaps, and names the closest product for a gap when there is one ("closest: X, missing anti-hunchback").
- [ ] The `followup` event, `interests` and the persona-aware Explainer are ticket 16 (this ticket sends `followUp: null`).
- [ ] Events in order with useful `detail` strings ("Planned 9 items", "Compared 47 products from 12 shops").
- [ ] Records `intent_sessions` + one `demand_items` row per plan item with `matchedCount` and `budgetHint` (= maxUnitPrice or budget share).
- [ ] Errors from the LLM become an `error` event, never a hung stream.
- [ ] S2 test with InMemoryAdapter + FakeLLM: event order; payloads valid against zod; uncovered item → noMatch + demand row with matchedCount 0.
- [ ] Planner tests (FakeLLM returning a deliberately sloppy plan for the hero sentence `My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.`): the prompt contains today's date and "Sep 5"; a returned deadline before today becomes null; after post-processing, `mustHaveTags` is `["anti-hunchback"]` on the backpack item and `[]` on every other item; `grade-1`/`kids` appear only in `niceToHaveTags`; a returned `quantity: 5` becomes 3; `quantity: 0` becomes 1; a book-cover or pen item returned with quantity 4 ends ≤ 3 and the prompt text contains the set/pack = 1 rule.
- [ ] Retry test: FakeLLM fails once (invalid JSON) then succeeds → stream completes normally (planner called exactly 2 times); fails twice → one `error` event `llm_error`, stream closes.
- [ ] Explainer test: the system prompt contains "70 words" and "4 sentences".
- [ ] Explainer failure test: FakeLLM stream yields "Partial " then throws → no `error` event; `step explain done` with detail `Explanation unavailable`, last event `done` (CONTRACT §3).
- [ ] Planner prompt also says: "Be consistent: the same sentence must give the same plan… Still list the full kit — for tet_gifts 5–8 gift items" (eval 28/10: a "be conservative" wording shrank Tet plans to 4 items).
- [ ] LLM client: `timeout: 45_000`, `maxRetries: 1`, stream idle guard 20 s (`withIdleTimeout`, unit-tested: passes deltas; throws when idle). `/api/kit` + `/refine` export `maxDuration = 120`.

## Full (in addition)
- [ ] S5 Matcher tests: deadline filter, must-have tag filter, maxUnitPrice, score ordering.
- [ ] Test: `profiles` parameter returns one option per profile.
- [ ] Timing log: each step's duration is logged server-side (`[kit] understand 6.1s search 0.4s …`) so Lane 3 can quote the real numbers.
- [ ] Test: the live hero query run records exactly one `demand_items` row per plan item (so `anti-hunchback` thisWeek goes 37 → 38 in ticket 05's test).
