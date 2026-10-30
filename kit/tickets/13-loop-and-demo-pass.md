# 13 — Close the loop + demo pass

**Lane:** 2 · **Target:** 15:00–15:40 · **Blocked by:** 06, 11, 12, 15, 17

**What to build:** DEMO.md runs start to finish on the deployed app with the seeded DB.

## Lean
- [ ] "Updated for this need" badge on basket rows and product cards when `updatedForDemandAt` is set.
- [ ] "Back to buyer" from `/seller` (→ `/kit`). No seller link inside the Kitly screen (D37); the header "Seller Centre" link is the way across.
- [ ] "Updated for this need" badge also on a basket line whose product replaced a previous "No exact match" row.
- [ ] Walk DEMO.md beats 1–4 on the deployed URL; fix every visual or flow issue found (UI only; backend issues → BLOCKERS.md for Lane 1).
- [ ] Loading/empty/error states everywhere; no layout shift when the basket arrives.

## Full (in addition)
- [ ] Judge-proofing list in DEMO.md passes (off-catalog need, no budget → clarify, Lan vs Guest, quick reply "Giao hoả tốc", tiny budget, swap over budget → Fit to budget, reload keeps the kit, second browser sees no history).
