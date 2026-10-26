# 04 — Refine: adapt the plan in plain language

**Lane:** 1 · **Target:** 13:15–13:45 · **Blocked by:** 03

**What to build:** `POST /api/kit/refine` takes the previous plan + a change message, has the planner
return a revised plan, re-runs Matcher/Optimizer/Explainer and streams the same events with `plan.diff`.

## Lean
- [ ] Planner prompt receives previous plan JSON + message; must keep unchanged items' `key`s.
- [ ] `PlanDiff` computed in code by item key (added / removed / changed fields).
- [ ] Explainer mentions what changed and the new total.
- [ ] Records a new intent session (demand counts include refinements).
- [ ] Test with FakeLLM: diff for "remove uniform + budget 1M" is `removed:["uniform"]`, budget updated, option total ≤ 1,000,000.

## Full (in addition)
- [ ] S6 tests: added item, changed must-have tag, unchanged keys preserved; invalid sessionId → 404.
