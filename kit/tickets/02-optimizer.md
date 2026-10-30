# 02 — Basket Optimizer (seam S1)

**Lane:** 1 · **Target:** 11:30–12:15 · **Blocked by:** 00

**What to build:** the pure function that turns a plan + scored candidates + shops + vouchers + profile into a
`BasketOption` exactly as PRD "Optimizer" describes. No I/O, no LLM. This is where the money must be right.

## Lean — tests first (S1), then code
- [ ] status `ok` ⇒ `grandTotal ≤ budget` (property-style test over many random small inputs).
- [ ] `grandTotal = itemsTotal + shippingTotal − discountTotal`, and per-shop groups add up.
- [ ] shipping = shop `shipFee` once per shop group; `FREESHIP` covers up to its value when the group subtotal ≥ min spend.
- [ ] at most one platform discount voucher, at most one shop voucher per shop, min spend respected.
- [ ] Wallet vouchers (D46) are just vouchers in the input list (the pipeline passes `listVouchers(persona)`): same rules, and a saving from a voucher with `ownerPersona != null` has `wallet: true` and a label starting "Your wallet voucher" (vi "Voucher trong ví của bạn"). Test: with `LAN-BTS10` in the list a ≥ 500,000 basket uses it instead of `SAVE5`, and the same input without it has a higher `grandTotal`.
- [ ] must-have items chosen before nice-to-haves; nice-to-haves dropped for budget appear in `skipped`.
- [ ] items with no candidate → `noMatch` with the right reason (passed in from the Matcher).
- [ ] consolidation: given two near-equal candidates, the one at a shop already in the basket is chosen when it lowers total cost; a `savings` line explains it.
- [ ] must-haves alone over budget ⇒ `status: "over_budget"`, `minimumCost`, `costDrivers` (top 3 lines by price).
- [ ] budget `null` ⇒ maximise score with a soft cap (no over_budget).
- [ ] `alternatives`: up to 2 next-best candidates from other shops per line.
- [ ] `savings` lists only deductions really applied (FREESHIP, shop voucher, platform voucher; a consolidation line only if it is a real price drop). No hypothetical lines like "one shipping fee instead of several". Test: for every generated option `sum(savings[].amount) === discountTotal`, and a basket with no vouchers/freeship has `savings: []`.
- [ ] Profiles per CONTRACT §1 "Profiles" (D34): one item set for all profiles, then saver = lowest grandTotal, premium = highest Σscore within budget, balanced = Σscore − α·cost. Candidate `score` is quality only (no price term) — do not add price back. No quality floor that leaves a single candidate per item: a shared floor, if any, is ≤ 0.5 × the item's best score.
- [ ] Over budget (`must-haves` alone exceed budget): also `overBy` and `fit` suggestions (shared with ticket 09's `priceSelection`; ticket 02 builds the `fitToBudget` pure function, ticket 09 wires the endpoint).
- [ ] Tests (S1) for the invariants on the hero fixture with budget 3,000,000: saver.grandTotal ≤ balanced.grandTotal ≤ premium.grandTotal; premium Σscore > saver Σscore; premium and saver differ on ≥ 2 lines; all ≤ budget. With budget 1,000,000 every profile is still ≤ budget.
- [ ] `fitToBudget` tests: drops "Add anyway" items first, then nice-to-haves (lowest score per ₫), then swaps to cheaper alternatives; a must-have is dropped only when nothing else fits (`dropsMustHave: true`); every suggestion's `grandTotal` equals the re-priced basket; at most 2 suggestions; labels in vi and en.

## Full (in addition)
- [ ] Property test: for random small inputs, every profile with status ok is ≤ budget and saver.grandTotal ≤ premium.grandTotal.
- [ ] Performance test: 12 items × 8 candidates, budget 5,000,000 runs < 200 ms.
