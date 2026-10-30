# 20b — Three baskets: UI polish (REQUIRED in full)

**Lane:** 2 · **Blocked by:** 20a, 11

- [ ] Tabs from ticket 11 show meaning + total (`Saver · 716.000₫ · lowest total` / `Balanced · best value` / `Premium · top-rated within budget`) and, under the tabs, one line on the difference vs Balanced ("−26.000₫, cheaper pens" / "+380.000₫, higher-rated shoes and lunch box"), computed in `src/lib/client/kit-compare.ts`.
- [ ] **Default selection = Balanced**; the Explainer text refers to it.
- [ ] **Identical baskets are merged:** same `grandTotal` AND same set of `(productId, quantity)` lines ⇒ ONE tab with the combined label (e.g. `Saver = Balanced`). Pure helper in `kit-compare.ts` (unit-tested: all three equal → one tab "Saver = Balanced = Premium"; two equal → two tabs).
- [ ] **No tabs when every option is empty** (`lines.length === 0` everywhere): show the single honest-gap view.
- [ ] Over-budget tabs keep their ⚠ and the ticket 15 warning; nothing is disabled (D29).
- [ ] Tests (`tests/ui`): merged-tab label, no tabs when all empty, difference line, default tab Balanced.
