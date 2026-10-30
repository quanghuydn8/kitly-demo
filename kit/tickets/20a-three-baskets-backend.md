# 20a — Three baskets: backend (REQUIRED in full)

**Lane:** 1 · **Blocked by:** 03

- [ ] `/api/kit`, `/refine` and `/adjust` honour `profiles: ["saver","balanced","premium"]` (default all three from the UI); profile semantics and invariants are ticket 02 (CONTRACT §1 "Profiles").
- [ ] Explainer describes the Balanced basket and adds one short line on how Saver and Premium differ ("Saver saves 210k with cheaper pens and shoes; Premium picks top-rated shoes for +380k"), still ≤ 70 words total.
- [ ] Test (pipeline, fixture catalog with ≥ 5 products per hero category): three options returned; saver.grandTotal ≤ balanced.grandTotal ≤ premium.grandTotal, all ≤ budget; with budget 3,000,000 premium ≠ saver.
- [ ] Test: when two profiles produce an identical basket the options are still returned separately (merging is a UI concern, ticket 20b).
