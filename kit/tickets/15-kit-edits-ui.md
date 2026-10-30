# 15 — Kit edits UI: remove, Add anyway, Fit to budget, inline edits (D28, D29, D32, D33)

**Lane:** 2 · **Target:** after 11 · **Blocked by:** 11, 09 (mock mode on fixtures until 09 is pushed)

**What to build:** let the buyer change the kit by touching it, never blocked, every change undoable.

## Lean
- [ ] **✕ on each basket row** ("I already have this") → `adjust remove_item`; the chat gets a system line "⚙ Removed: Water bottle · Undo" (Undo → `adjust restore_item`).
- [ ] **Add anyway** on a "No exact match" row's closest product → `POST /api/kit/price` with the product in `selection.picks`; the row turns into a normal basket line labelled "Closest match · missing anti-hunchback" with a ✕ to take it out again.
- [ ] **Over budget warning, never a block:** when the selected option is `over_budget`, a red banner "Over budget by 536.800₫" + the `fit` suggestions as buttons (label + new total; "removes a must-have" tag when `dropsMustHave`). Clicking one sends its removals/swaps as the next selection to `/api/kit/price`; an "Undo" link restores the previous selection. "Add kit to cart" stays enabled and reads "Add kit to cart (over budget by 536.800₫)".
- [ ] **Inline budget / deadline edit** in the kit header (pencil → input → Enter) → `adjust set_budget` / `set_deadline`; the chat gets the system line.
- [ ] **Assumption chips editable:** click a chip → small inline input prefilled with the chip text → Enter sends a refine message `"<old assumption>" is wrong: <new text>` through the composer path (LLM refine, new version).
- [ ] All edits update the kit panel from the server response (no client price maths) and survive a reload (selection saved by `/api/kit/price`).
- [ ] Buttons disabled while a request is in flight; errors shown inline, kit unchanged.

## Full (in addition)
- [ ] Component tests (fixtures): ✕ produces the system line with Undo; over-budget fixture shows the banner, two fit buttons and an enabled Add-to-cart with the over-budget text; Add anyway turns the closest row into a line.
