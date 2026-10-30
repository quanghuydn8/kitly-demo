# 08 — LLM eval script (FULL MODE ONLY, seam S8)

**Lane:** 1 · **Blocked by:** 03

- [ ] `npm run eval` runs the planner on: 6 event queries (one per event, EN + VI mixed) + 3 off-coverage ("adopting a puppy", "planning a wedding", "learning guitar").
- [ ] Also: the VI and EN Beat 1 sentences (no date) ⇒ `deadline === "2026-09-05"` with `DEMO_TODAY=2026-09-02`; `Ship hoả tốc giúp tôi` as a refine of that plan ⇒ `deadline === "2026-09-04"`, `intent: "change_kit"`; `Balo Minh An có chống gù thật không?` ⇒ `intent: "answer"`.
- [ ] Checks: ≥ 5 items; ≥ 70% of items' categories belong to the expected event; off-coverage ⇒ ≥ 50% `null` categories and no wrong-event categories; prints latency per call and a pass/fail table; exits non-zero on failure.
- [ ] Not part of `npm test` (costs tokens).
