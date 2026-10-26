# 06 — Listing enrichment: preview / apply / undo (seam S4)

**Lane:** 1 · **Target:** 14:30–15:00 · **Blocked by:** 05

**What to build:** the three enrichment endpoints. The fix is **additive only**: nothing in the original
listing is removed, old keywords keep matching, and undo restores the exact previous listing.

## Lean
- [ ] `proposeEnrichment(product, gap)`: fast model drafts `titleSuffix`, `tags` (subset of gap tags supported by evidence), `attributes`, `descriptionAppend`, `evidence`. Proposal stored in memory/DB with an id (TTL 30 min).
- [ ] `mergeEnrichment(listing, proposal)` pure: title = original + " | " + suffix (trim suffix to fit 120 chars, never cut the original); tags/attributes union (never overwrite an existing attribute value); description = original + "\n\n" + append.
- [ ] `keywordCheck(old, new)`: every original title token (lowercased, ≥ 3 chars) still contained ⇒ list with `stillMatches`.
- [ ] Apply: `adapter.updateListing` (snapshot first) + set `updatedForDemandAt = now`. Undo: `adapter.undoListing`, clears the badge.
- [ ] After apply, the hero query's Matcher finds `prod-minhan-backpack` (test with InMemoryAdapter).
- [ ] S4 tests: original title preserved; additive only; keywordCheck all true; undo restores deep-equal previous listing; second undo → 404.

## Full (in addition)
- [ ] Test: proposal tags not supported by evidence are dropped by code even if the LLM returns them.
- [ ] Test: expired/unknown proposalId → 404.
