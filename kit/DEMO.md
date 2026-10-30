# Kitly — 6-minute demo script

Run on the deployed URL, fresh seed (`npm run seed` before the round), `DEMO_TODAY=2026-09-02`, persona **Lan** (header
chip "👤 Lan · Cau Giay, Hanoi · 2 vouchers"), browser at 1440×900, zoom 110%.
Every **Expect** line is an acceptance check (Full mode automates them in the Playwright e2e test).

## 0:00–0:40 · Problem (slide, no app)
"Search answers *which products match these words*. People shop from a need. Today the buyer builds the list,
compares 10 tabs, does voucher maths and still has no idea if it arrives on time. And sellers never see the
needs they failed to serve."

## 0:40–2:30 · Beat 1: Need → Kit (chat on the left, kit on the right)
1. DemoMart home → toggle **Describe your need** on the search bar.
2. Type (round 1 in Vietnamese, final in English):
   - VI: `Con tôi chuẩn bị vào lớp 1, ngân sách 1,5 triệu. Balo phải chống gù, dưới 400k.`
   - EN: `My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.`
   (No date on purpose: Kitly knows school opens Sep 5, D45.)
3. **Expect** the URL becomes `/kit/t/<id>`, the kit appears in the history sidebar, and the assistant message shows the
   timeline: Understanding → Planned ≥ 8 items → Compared N products from M shops → Optimized → Explaining.
4. **Expect** kit header: budget 1.500.000₫, **by Sep 5**, "Deliver to Cau Giay, Hanoi"; assumption chips in the chat
   include "By Sep 5 (school opening)" (plus e.g. "1 child", "Grade 1").
5. **Expect** tabs `Saver · … · lowest total` / `Balanced · … · best value` / `Premium · … · top-rated within budget`,
   Balanced selected, every total ≤ 1.500.000₫, Saver < Premium; Bago Bags items absent (cannot arrive by Sep 5);
   savings panel shows the line **"Your wallet voucher Back-to-school 10%"** and at least one shop saving line.
6. **Expect** backpack row: *"No exact match: no anti-hunchback backpack under 400k"* with **closest: Minh An Kids
   Backpack New Model 2026 · 349.000₫ · Missing: anti-hunchback** and an **Add anyway** button.
7. **Expect** under the backpack row the card **"💛 In your cart: KidZone Lite Backpack Grade 1–3 · 520.000₫ → 440.000₫
   with LAN-KZ80 · over your 400k limit by 40.000₫ · missing anti-hunchback"** with **Switch to this**.
8. **Expect** the assistant message ends with ONE question that uses a real fact (usually: *"Còn 3 ngày nữa là khai
   giảng 5/9 — bạn có muốn giao hoả tốc…?"* or the cart backpack / the voucher expiring Sep 4) and 2–3 quick-reply buttons.
9. Say: "Kitly never pretends: closest product and exactly what it lacks, and that gap is now a demand signal. And it
   knows Lan: her wallet voucher is applied, the backpack she left in her cart is right here, and it reminds her school
   starts in 3 days."
10. (5 s) Click **Premium** then back to **Balanced**: "Three real trade-offs, not three copies."

## 2:30–3:30 · Beat 2: Talk + adapt (chat + direct edit)
0. Type a question: VI `Balo Minh An có chống gù thật không?` / EN `Is the Minh An backpack really anti-hunchback?`
   **Expect** an answer quoting the description (S-shaped straps, keeps the spine straight), ending with a question +
   quick replies; the kit header still reads **Version 1 of 1** (an answer never changes the kit, D42).
1. In the chat composer type: VI `Trường phát đồng phục rồi, giảm ngân sách còn 1 triệu.` / EN `School gives the uniform, cut the budget to 1M.`
   (Keep 1M: the kit after removing the uniform is ≈ 490–590k, so it never goes over. The honest over-budget story is
   shown with "Grade 1, budget 200k" in Judge-proofing.)
2. **Expect** a new user bubble, the kit header shows **Version 2 of 2**, diff chip "Removed: uniform", budget
   1.000.000₫, grand total ≤ 1.000.000₫, explanation starts with what changed and the new total.
3. Click ✕ on the water bottle ("we already have one"). **Expect** system line "⚙ Removed: Water bottle · Undo", total drops
   instantly (< 1 s, no AI call).
4. Press **F5**. **Expect** the same kit, version 3, every chat turn (incl. the answer). Say: "Every change is a version; nothing is lost."

## 3:30–5:00 · Beat 3: Seller Intelligence
1. Header → **Seller Centre**, choose **Minh An Stationery**.
2. **Expect** the **Just searched (live)** strip shows "Anti-hunchback backpack" from a minute ago.
3. **Expect** the first card for Minh An is the *Listing gap* for the backpack: *Anti-hunchback backpack*: this week 38
   (37 seeded + the Beat 1 live query; answers, refines and edits do not count), last week 21, price band 300k–400k, type
   **Listing gap**, candidate *Minh An Kids Backpack New Model 2026* with evidence quote containing `spine straight`.
4. **Expect** assortment gap card: *Kids raincoat with backpack cover*: 52 this week, 0 shops selling,
   needed with school-backpack. No "add product" button.
5. Click **Preview fix** on the listing gap. **Expect**: green "added" tags `anti-hunchback`, `lightweight`,
   `grade-1`; title = original title + suffix; "Old keywords still match ✓" for every original title keyword.
6. Click **Apply**. Say: "No new listing, no duplicate, nothing lost, and one click to undo."

## 5:00–5:40 · Beat 4: The loop closes
1. Back to the buyer: **+ New kit**, run the Beat 1 sentence again.
2. **Expect** the backpack row is now a normal line: Minh An Kids Backpack (349.000₫) with badge **Updated for this
   need** (the same product that was "closest, missing anti-hunchback" in Beat 1), basket still ≤ 1.500.000₫, and the
   Minh An group has one more item.

## 5:40–6:00 · Close
"Built today with Codex: N tickets, M agent runs (see CODEX_LOG.md). Kitly talks to the store through one
adapter, so any marketplace can plug it in."

## Judge-proofing (Q&A rehearsal)
- Judge types an off-catalog need without a budget ("adopting a puppy"): Kitly asks **"What's your budget?"** with
  quick choices; after a choice the plan appears, uncovered items sit in **Not in store yet**, and Seller Centre's
  **Just searched (live)** strip shows the need within 10 s.
- **Lan vs Guest (D43):** header switch → **Guest**, **+ New kit**, the Beat 1 sentence. **Expect** no 💛 card, no wallet
  saving line, header chip "Guest", and a higher Balanced total than Lan's (same products, no LAN-BTS10). Switch back to Lan.
- Judge clicks a quick reply, e.g. **Giao hoả tốc**: a refine with deadline Sep 4 → Version 2, only 1–2-day products
  (Minh An backpack is still the closest, ship 1–2 days). A quick reply about the cart backpack swaps it in < 1 s (no AI call).
- Judge sets a tiny budget ("Grade 1, budget 200k"): status `over_budget` with minimum cost, drivers and **Fit to
  budget** suggestions; Add to cart still works with the warning — never a fake basket, never a dead end.
- Judge swaps the backpack for the 890k one: banner "Over budget by …", click a Fit to budget suggestion → back under.
- Judge reloads or opens another browser: reload keeps the kit; the other browser has an empty history (per-browser
  cookie today, accounts in production).
- "Why not a cart that knows my intent / shop pages / seller sales KPIs?": next steps (D26) — the loop is the core.
- "Is Lan real? Can sellers use cart data?": one seeded persona standing in for the marketplace's buyer profile; in
  production it comes from the account. Telling sellers "18 buyers left your backpack in their cart" is a next step (D47).
- "Is the data real?": a seeded catalog behind the Commerce Adapter; swap the adapter for a marketplace API.
- After the demo: click **Undo** on the listing so the next run starts clean (or re-seed).
