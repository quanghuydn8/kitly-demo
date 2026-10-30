# 12 — Seller Intelligence screen

**Lane:** 2 · **Target:** 13:30–14:45 · **Blocked by:** 00 (fixtures) — live once 05/06 are pushed

**What to build:** `/seller`, the seller's view of unmet demand with the listing-fix flow.

## Lean
- [ ] Shop selector (All shops + each shop), default from `?shop=`. Render gaps in the order the API returns them (listing gaps first for a single shop; do not re-sort client-side).
- [ ] KPI strip: unmet needs this week, total searches this week, trend vs last week.
- [ ] Gap cards: need label, type badge (**Listing gap** blue / **Assortment gap** amber), this week vs last week with ▲%, price band, needed with (category chips), advice sentence, matching products count.
- [ ] Listing gap card: candidate product with evidence quote; **Preview fix** → drawer showing before/after title, added tags (green), kept tags (grey), added attributes, appended description, "Old keywords still match ✓/✗" list; **Apply** → toast + card shows "Fixed · Undo"; **Undo** works. The "Fixed · Undo" state is driven by `gap.appliedFix` from the API (not local state), so it is still shown after a page reload, and **Undo** works at any time. A listing gap card shows the supply line "1 listing could match if its tags were fixed" (N listings → "N listings could match if their tags were fixed"), never "Supply: 1 matching product".
- [ ] Assortment gap card: decision-support only (no add-product button); copy "0 shops selling". The grouped null-category gap shows its `needLabel` ("Not in catalog: Dog food, Dog bed") like any assortment gap.
- [ ] Combos section and top needs by event (simple bars).
- [ ] Refresh button (counts update after a live kit run).
- [ ] **"Just searched (live)" strip** at the top (D35): the `recent` items as compact chips/rows (need label, event colour, "2 min ago", "Not in catalog" when `category` is null); auto-refreshes every 10 s while the tab is visible (re-fetch insights); empty state "No live searches yet — try Kitly". Shown for every shop selection.

## Full (in addition)
- [ ] "N buyers waiting" on assortment gaps + buyer-side "Notify me" button on noMatch rows in `/kit` (needs ticket 07).
- [ ] Component test: the live strip renders `recent` newest first and its empty state; preview drawer renders added vs kept and the keyword check; a gap with `appliedFix` renders "Fixed · Undo" on first render; a listing gap with 1 candidate renders "1 listing could match if its tags were fixed".
