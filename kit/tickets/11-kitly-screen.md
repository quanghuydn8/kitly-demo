# 11 — Kitly screen: history · chat · kit (D30)

**Lane:** 2 · **Target:** 11:45–13:45 · **Blocked by:** 00 (uses `NEXT_PUBLIC_KITLY_MOCK=1` until tickets 03/04 are pushed, then switch to live)

**What to build:** the hero screen of the demo, built like a chat assistant: a history sidebar of the buyer's kits,
a chat column, and the live kit panel. Kit edits (✕, Add anyway, Fit to budget, inline budget/deadline, chip edits)
are ticket 15; personalisation (persona chip, 💛 cards, follow-up question, answer turns) is ticket 17; this ticket
renders everything else and wires new kit + refine.

```
┌──────────┬────────────────────────┬──────────────────────────────────────────┐
│ History  │ Chat                   │ Kit  (Version 2 ▾)                       │
│ + New kit│ 🧑 need sentence        │ Budget 1.000.000₫  · By Sep 5            │
│ Kit A    │ 🤖 timeline → summary  │ [Saver · 716k][Balanced · 742k][Premium] │
│ Kit B    │    assumption chips    │ line rows (swap) · No exact match rows   │
│ …        │ 🧑 refine message       │ Not in store yet (n) · Notify me         │
│          │ 🤖 "Removed uniform…"   │ Totals · savings · Add kit to cart        │
│          │ [composer          ⏎]  │                                          │
└──────────┴────────────────────────┴──────────────────────────────────────────┘
```

## Lean
- [ ] Routes: `/kit` → redirect to the newest thread of this browser (`GET /api/threads`) or `/kit/new`; `/kit/new` = empty chat with a big composer + example chips (one per event); `/kit/new?q=` starts a new kit at once and replaces the URL with `/kit/t/<threadId>` as soon as the `plan` event arrives; `/kit/t/<id>` loads `GET /api/threads/:id` and renders the latest version (reload keeps the kit; 404 → friendly "Kit not found" + New kit).
- [ ] SSE client (fetch + ReadableStream parser for POST) in `src/lib/client/`.
- [ ] **History sidebar** (collapsible, 240 px): "+ New kit" button on top, then the caller's threads (title + relative date), active one highlighted; refreshed after every run.
- [ ] **Chat column**: one user bubble per version (`userText`) and one assistant message per version. While a run streams, the assistant message shows the **timeline** (spinner → check, detail text) and, when done, collapses it to one line ("Planned 9 items · compared 47 products") followed by the explanation text and the plan's **assumptions as chips** (read-only here; editable in ticket 15). `adjust` versions render as a small system line ("⚙ Removed: Lunch box"). Composer at the bottom: on a new kit it posts `/api/kit`; inside a thread it posts `/api/kit/refine` with `{ threadId, message }`. Composer disabled while streaming.
- [ ] **Clarify message**: a `clarify` event (or a loaded `awaiting_budget` version) renders the question with quick-choice buttons from `choices` (formatted ₫; `null` → "No limit") — clicking calls `POST /api/kit/adjust { type: "set_budget" }` and renders the returned version. The kit panel shows "Waiting for your budget" meanwhile.
- [ ] **Kit panel** header: event chip, budget, deadline, **version switcher** ("Version 2 of 2 ▾"; choosing an older version shows it read-only with a "Restore this version" button → `adjust restore_version`).
- [ ] Profile tabs **Saver / Balanced / Premium**, each with its meaning and total, e.g. `Saver · 716.000₫ · lowest total`, `Balanced · 742.000₫ · best value`, `Premium · 1.120.000₫ · top-rated within budget`; ⚠ on a tab whose status is `over_budget`; identical baskets merged (`kit-compare.ts`, see 20b); **default tab Balanced**.
- [ ] Basket: one row per line: chosen product (mini card), reason, quantity, line total, "2 alternatives" expander with **Swap** (posts `/api/kit/price`; totals come from the server, not client maths).
- [ ] **No exact match rows** (`noMatch` with `closest`): the honest sentence in the plan language from `src/lib/client/kit-text.ts` ("No exact match: no anti-hunchback backpack under 400k" / "Chưa có balo chống gù dưới 400.000₫") plus the closest product mini card with "Missing: anti-hunchback" (and "Over your max price by 50.000₫" when set). The Add anyway button is ticket 15.
- [ ] **Not in store yet** block: `noMatch` rows without `closest` grouped in one compact collapsible block "Not in store yet (3)" with need labels (Notify me buttons: ticket 12-Full).
- [ ] "Skipped for budget" section; totals panel (items, shipping, discounts, grand total vs budget bar, savings lines); `over_budget` banner with minimum cost + drivers.
- [ ] "Add kit to cart" → cart (ticket 10) → checkout (enabled even when over budget: ticket 15 adds the warning).
- [ ] No seller buttons or links anywhere in the Kitly screen (D37).
- [ ] `error` event shows inline in the assistant message with Retry.
- [ ] Mobile (≤ 768 px): sidebar becomes a drawer; Chat / Kit tabs.

## Full (in addition)
- [ ] Unit test for the SSE parser (chunk boundaries, multi-line data).
- [ ] Component tests from fixtures: a thread with 2 versions renders 2 user bubbles and the version switcher; a `clarify` version renders 4 choice buttons; a noMatch row with `closest` renders "Missing: anti-hunchback"; a noMatch row without `closest` lands in "Not in store yet"; with `plan.language = "vi"` the noMatch sentence is Vietnamese; default tab Balanced.
