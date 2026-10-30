# 04 — Refine: adapt the plan in plain language

**Lane:** 1 · **Target:** 13:15–13:45 · **Blocked by:** 03

**What to build:** `POST /api/kit/refine` takes `{ threadId, message }`, loads the latest version of the
caller's thread (plan + `excludedKeys`), has the planner return a revised plan, re-runs
Matcher/Optimizer/Explainer, streams the same events with `plan.diff`, and appends a new version (`kind: "refine"`).

## Lean
- [ ] Planner prompt receives previous plan JSON + message + excluded items ("the buyer already has these, never add them"); must keep unchanged items' `key`s. Code then removes any returned item whose key or category matches an excluded item (D33).
- [ ] Thread not found or not the caller's → 404 JSON before any stream.
- [ ] `PlanDiff` computed in code by item key (added / removed / changed fields).
- [ ] Explainer mentions what changed and the new total.
- [ ] Records a new intent session (so the buyer can refine again) but **NO `demand_items`**: call `recordIntent`, never `recordDemandItems`. A refinement is the same need, not new demand.
- [ ] Test with FakeLLM: diff for "remove uniform + budget 1M" is `removed:["uniform"]`, budget updated, option total ≤ 1,000,000; the thread now has version 2 and version 1 is unchanged.
- [ ] Test: with `excludedKeys: ["water-bottle"]`, a FakeLLM plan that re-adds a water bottle (any key, category `water-bottle`) ends without it.
- [ ] The refine planner schema includes `intent: "change_kit" | "answer"` (CONTRACT §3, prompt: `answer` only when no constraint changes); in this ticket every intent is still handled as `change_kit`. Ticket 16 adds the answer path.

## Full (in addition)
- [ ] Test: after a refine, `demandItemsSince(...)` row count is unchanged and the `anti-hunchback` gap `thisWeek` is unchanged; the intent session count is +1.
- [ ] S6 tests: added item, changed must-have tag, unchanged keys preserved; invalid sessionId → 404.
