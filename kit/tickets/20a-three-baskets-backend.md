# 20a — Three baskets: backend (STRETCH in lean · REQUIRED in full)

**Lane:** 1 · **Blocked by:** 03 · **Lean rule:** start only if ticket 13 is done by 15:00

- [ ] `/api/kit` and `/refine` honour `profiles: ["saver","balanced","premium"]`; Explainer adds one line per profile ("Saver saves 210k by …").
- [ ] Test: three options returned, saver.grandTotal ≤ balanced.grandTotal ≤ premium.grandTotal on the hero fixture, all ≤ budget.
