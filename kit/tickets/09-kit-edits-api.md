# 09 — Kit edits + history API: adjust, price, threads (seams S6, S9)

**Lane:** 1 · **Target:** after 04 · **Blocked by:** 02, 03

**What to build:** the code-only endpoints behind the chat/kit screen (CONTRACT §3 "Kit edits"): edit the kit
without the LLM in < 1 s, re-price buyer selections with "Fit to budget", and list/load the caller's threads.

## Lean
- [ ] `POST /api/kit/adjust` for `set_budget`, `set_deadline`, `remove_item`, `restore_item`, `restore_version`: loads the latest version, applies the change to plan / `excludedKeys`, re-runs Matcher + Optimizer for the requested profiles (default all three), writes a code-template `explanation` in the plan language, appends a version (`kind: "adjust"` / `"restore"`), returns it. `set_budget` on an `awaiting_budget` version produces the thread's first options and records the demand items (once per thread).
- [ ] `priceSelection(plan, candidatesByItem, selection, shops, vouchers)` pure: applies `picks` (swaps + Add anyway closest products) and `dropped`, prices exactly like the Optimizer; over budget ⇒ `status: "over_budget"`, `overBy`, `fit` (ticket 02's `fitToBudget`).
- [ ] `POST /api/kit/price` → re-runs the Matcher for the stored plan (to get candidates/closest), calls `priceSelection`, saves `selection` on the latest version, returns `{ option }`. A `picks` product that is neither a candidate, an alternative nor the closest of that item → 400.
- [ ] `GET /api/threads` and `GET /api/threads/:id` (owner from cookie; other owner → 404).
- [ ] S6 tests (InMemoryAdapter + InMemoryKitStore): remove → restore round-trip; `restore_version 1` after a refine gives a version whose plan equals version 1; adjust never calls the LLM (FakeLLM with no queued answers).
- [ ] S9 tests: totals add up for random selections; a swap that pushes the hero basket over 1,000,000 ⇒ `over_budget` with `overBy` and 1–2 `fit`; applying a `fits: true` suggestion as the next selection gives ≤ budget; Add anyway of the closest backpack is priced with its shop's shipping/vouchers.

## Full (in addition)
- [ ] Performance: adjust and price answer < 1 s on the seeded DB (log timing; test with the in-memory store < 100 ms).
- [ ] Test: `set_budget` on an `awaiting_budget` thread records demand items exactly once; a second `set_budget` records none.
