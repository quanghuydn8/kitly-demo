# 05 — Seller insights (seam S3)

**Lane:** 1 · **Target:** 13:45–14:30 · **Blocked by:** 01

**What to build:** `GET /api/seller/insights?shopId=` returns gaps, combos and top needs per CONTRACT.md,
with listing vs assortment classification and one cached AI advice sentence per gap.

## Lean
- [ ] Aggregate demand items for this week / last week (DEMO_TODAY windows); group by gap key; unmet = matchedCount < 2.
- [ ] Price band p25/p75 of budget hints; `neededWith` = top 3 co-occurring categories in the same sessions.
- [ ] Classification for a selected shop: candidates = shop products in the gap category within 1.3× p75 lacking the gap tags → fast model judges "does the description support these tags?" (Structured Output: supports, evidence quote). Any supported candidate ⇒ `listing_gap` (with candidates), else `assortment_gap`. `shopId=all` ⇒ classify against all shops.
- [ ] Advice: fast model, 1 sentence, cached in `insight_advice` by gap key + counts signature.
- [ ] Sort gaps by thisWeek desc; return top 8.
- [ ] S3 tests (InMemoryAdapter + FakeLLM): counts per window, unmet threshold, classification, shop filter, price band.

## Full (in addition)
- [ ] Test: advice cache hit does not call the LLM again; counts change ⇒ regenerated.
- [ ] Test: a live kit run increments the matching gap's thisWeek by 1.
