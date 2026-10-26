# 12 — Seller Intelligence screen

**Lane:** 2 · **Target:** 13:30–14:45 · **Blocked by:** 00 (fixtures) — live once 05/06 are pushed

**What to build:** `/seller`, the seller's view of unmet demand with the listing-fix flow.

## Lean
- [ ] Shop selector (All shops + each shop), default from `?shop=`.
- [ ] KPI strip: unmet needs this week, total searches this week, trend vs last week.
- [ ] Gap cards: need label, type badge (**Listing gap** blue / **Assortment gap** amber), this week vs last week with ▲%, price band, needed with (category chips), advice sentence, matching products count.
- [ ] Listing gap card: candidate product with evidence quote; **Preview fix** → drawer showing before/after title, added tags (green), kept tags (grey), added attributes, appended description, "Old keywords still match ✓/✗" list; **Apply** → toast + card shows "Fixed: Undo"; **Undo** works.
- [ ] Assortment gap card: decision-support only (no add-product button); copy "0 shops selling".
- [ ] Combos section and top needs by event (simple bars).
- [ ] Refresh button (counts update after a live kit run).

## Full (in addition)
- [ ] "N buyers waiting" on assortment gaps + buyer-side "Notify me" button on noMatch rows in `/kit` (needs ticket 07).
- [ ] Component test: preview drawer renders added vs kept and the keyword check.
