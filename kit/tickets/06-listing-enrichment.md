# 06 — Listing enrichment: preview / apply / undo (seam S4)

**Lane:** 1 · **Target:** 14:30–15:00 · **Blocked by:** 05

**What to build:** the three enrichment endpoints. The fix is **additive only**: nothing in the original
listing is removed, old keywords keep matching, and undo restores the exact previous listing.

## Lean
- [ ] `proposeEnrichment(product, gap)`: fast model drafts `titleSuffix`, `tags` (subset of gap tags supported by evidence), `attributes`, `descriptionAppend`, `evidence`. Proposal stored in memory/DB with an id (TTL 30 min).
- [ ] `mergeEnrichment(listing, proposal)` pure: title = original + " | " + suffix (trim suffix to fit 120 chars, never cut the original); tags/attributes union (never overwrite an existing attribute value); description = original + "\n\n" + append **only when `descriptionAppend` is non-empty** (see next item).
- [ ] **Enrichment adds only new information:** the draft prompt tells the model to put into `descriptionAppend` only facts that are not already in the listing (title, tags, attributes, description). Code enforces it: drop any sentence of `descriptionAppend` that is already contained (case-insensitive) in the original description; if nothing remains, `descriptionAppend` is `""` and `mergeEnrichment` leaves the description unchanged (no trailing blank lines, no repeated text).
- [ ] `keywordCheck(old, new)`: every original title token (lowercased, ≥ 3 chars) still contained ⇒ list with `stillMatches`.
- [ ] Apply: `adapter.updateListing` (snapshot first) + set `updatedForDemandAt = now`. Undo: `adapter.undoListing`, clears the badge.
- [ ] After apply, the hero query's Matcher finds `prod-minhan-backpack` (test with InMemoryAdapter).
- [ ] After Apply, `GET /api/seller/insights?shopId=shop-minhan` shows the gap with `appliedFix` set (T05); after Undo it is `null`. Undo works at any time later, not only right after Apply.
- [ ] S4 tests: a proposal whose `descriptionAppend` repeats the existing description yields an unchanged description; original title preserved; additive only; keywordCheck all true; undo restores deep-equal previous listing; second undo → 404.

## Full (in addition)
- [ ] Test: proposal tags not supported by evidence are dropped by code even if the LLM returns them.
- [ ] Test: expired/unknown proposalId → 404.
- [ ] **Serverless-safe proposals** (CONTRACT §3): proposalId is an HMAC-signed self-contained token, no process memory. Test: preview → clear any in-memory state → apply still succeeds; a tampered token → 404; applying the same token twice → second is 404. Preview/insights routes export `maxDuration = 300`.
