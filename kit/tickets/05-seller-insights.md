# 05 — Seller insights (seam S3)

**Lane:** 1 · **Target:** 13:45–14:30 · **Blocked by:** 01

**What to build:** `GET /api/seller/insights?shopId=` returns gaps, combos and top needs per CONTRACT.md,
with listing vs assortment classification and one cached AI advice sentence per gap.

## Lean
- [ ] Aggregate demand items for this week / last week (DEMO_TODAY windows); group by gap key; unmet = matchedCount < 2. **Count distinct `sessionId`s per gap, not rows.** Needs with `category: null` are grouped into ONE gap (key `none|`, `assortment_gap`) whose `needLabel` is `"Not in catalog: "` + the 2 most frequent `needLabel`s (CONTRACT §3 Gap rules). Gaps with `thisWeek < 3` are dropped.
- [ ] Price band p25/p75 of budget hints; `neededWith` = top 3 co-occurring categories in the same sessions.
- [ ] Classification for a selected shop: candidates = shop products in the gap category within 1.3× p75 lacking the gap tags → fast model judges "does the description support these tags?" (Structured Output: supports, evidence quote). Any supported candidate ⇒ `listing_gap` (with candidates), else `assortment_gap`. `shopId=all` ⇒ classify against all shops.
- [ ] Advice: fast model, 1 sentence, cached in `insight_advice` by gap key + counts signature.
- [ ] `recent` (D35): the 10 newest LIVE unmet demand items via `adapter.recentDemandItems`, no threshold, newest first; seed rows never appear. Test: after a live kit run with an off-coverage item, `recent[0]` is that item even though its gap is below the threshold.
- [ ] Sort: for a specific `shopId`, `listing_gap`s first then `assortment_gap`s, each group by `thisWeek` desc; for `shopId=all` by `thisWeek` desc only. Then return top 8.
- [ ] `appliedFix`: set per CONTRACT §3 (shop product in the gap category with all gap tags AND `updatedForDemandAt != null` ⇒ gap stays `listing_gap`, `appliedFix = {productId,title,appliedAt}`; else `null`). Classification must check this BEFORE the LLM candidate judgement, so an already-fixed gap is stable across reloads.
- [ ] S3 tests (InMemoryAdapter + FakeLLM): counts per window, unmet threshold, classification, shop filter, price band.
- [ ] S3 tests for the rules above: a session with two items in the same gap counts once; a gap with `thisWeek` 2 is absent and 3 is present; three differently-labelled null-category needs yield exactly one `none|` gap labelled with the 2 most common labels; for `shopId=shop-minhan` the first gap is the `anti-hunchback` listing_gap even if an assortment gap has a higher `thisWeek`; after `updateListing` + `updatedForDemandAt` set, the same gap comes back with `appliedFix` non-null and still `listing_gap`; after `undoListing` it is `null` again.

## Full (in addition)
- [ ] Test: advice cache hit does not call the LLM again; counts change ⇒ regenerated.
- [ ] Test: a live kit run increments the matching gap's thisWeek by 1.
