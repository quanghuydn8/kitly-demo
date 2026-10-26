# 02 — Basket Optimizer (seam S1)

**Lane:** 1 · **Target:** 11:30–12:15 · **Blocked by:** 00

**What to build:** the pure function that turns a plan + scored candidates + shops + vouchers + profile into a
`BasketOption` exactly as PRD "Optimizer" describes. No I/O, no LLM. This is where the money must be right.

## Lean — tests first (S1), then code
- [ ] status `ok` ⇒ `grandTotal ≤ budget` (property-style test over many random small inputs).
- [ ] `grandTotal = itemsTotal + shippingTotal − discountTotal`, and per-shop groups add up.
- [ ] shipping = shop `shipFee` once per shop group; `FREESHIP` covers up to its value when the group subtotal ≥ min spend.
- [ ] at most one platform discount voucher, at most one shop voucher per shop, min spend respected.
- [ ] must-have items chosen before nice-to-haves; nice-to-haves dropped for budget appear in `skipped`.
- [ ] items with no candidate → `noMatch` with the right reason (passed in from the Matcher).
- [ ] consolidation: given two near-equal candidates, the one at a shop already in the basket is chosen when it lowers total cost; a `savings` line explains it.
- [ ] must-haves alone over budget ⇒ `status: "over_budget"`, `minimumCost`, `costDrivers` (top 3 lines by price).
- [ ] budget `null` ⇒ maximise score with a soft cap (no over_budget).
- [ ] `alternatives`: up to 2 next-best candidates from other shops per line.
- [ ] profile weights exist (`saver`, `balanced`, `premium`) but Lean only calls `balanced`.

## Full (in addition)
- [ ] Tests for `saver` (minimises cost subject to a score floor) and `premium` (maximises score within budget) producing different baskets on the same input.
- [ ] Performance test: 12 items × 8 candidates, budget 5,000,000 runs < 200 ms.
