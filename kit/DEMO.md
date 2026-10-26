# Kitly — 6-minute demo script

Run on the deployed URL, fresh seed (`npm run seed` before the round), browser at 1440×900, zoom 110%.
Every **Expect** line is an acceptance check (Full mode automates them in the Playwright e2e test).

## 0:00–0:40 · Problem (slide, no app)
"Search answers *which products match these words*. People shop from a need. Today the buyer builds the list,
compares 10 tabs, does voucher maths and still has no idea if it arrives on time. And sellers never see the
needs they failed to serve."

## 0:40–2:30 · Beat 1: Need → Kit
1. DemoMart home → toggle **Describe your need** on the search bar.
2. Type (round 1 in Vietnamese, final in English):
   - VI: `Con tôi chuẩn bị vào lớp 1, ngân sách 1,5 triệu, cần có đồ trước 25/8. Balo phải chống gù, dưới 400k.`
   - EN: `My kid starts Grade 1. Budget 1.5M VND, need everything by Aug 25. The backpack must be anti-hunchback, under 400k.`
3. **Expect** timeline: Understanding → Planned ≥ 8 items → Compared N products from M shops → Optimized → Explaining.
4. **Expect** plan: event back_to_school, budget 1,500,000, deadline 2026-08-25; backpack item must-have with
   `anti-hunchback`, max 400,000.
5. **Expect** basket: status ok, grand total ≤ 1,500,000; Bago Bags items absent (cannot arrive by Aug 25);
   savings panel shows at least one consolidation/voucher line at Minh An Stationery.
6. **Expect** backpack row: *"No suitable product yet: no anti-hunchback backpack under 400k"* (honest gap).
7. Say: "Kitly never invents a product. That gap is now a demand signal."

## 2:30–3:30 · Beat 2: Adapt
1. In the refine box type: VI `Trường phát đồng phục rồi, giảm ngân sách còn 1 triệu.` / EN `School gives the uniform, cut the budget to 1M.`
2. **Expect** diff: uniform item removed; budget 1,000,000; grand total ≤ 1,000,000; nice-to-haves dropped
   listed under "Skipped for budget"; explanation names what changed.

## 3:30–5:00 · Beat 3: Seller Intelligence
1. Open `/seller`, choose **Minh An Stationery**.
2. **Expect** top gap: *Anti-hunchback backpack*: this week 38 (37 seeded + the live query), last week 21,
   price band 300k–400k, type **Listing gap**, candidate *Minh An Kids Backpack New Model 2026* with evidence
   quote "Padded ergonomic back panel … keep the spine straight".
3. **Expect** assortment gap card: *Kids raincoat with backpack cover*: 52 this week, 0 shops selling,
   needed with school-backpack. No "add product" button.
4. Click **Preview fix** on the listing gap. **Expect**: green "added" tags `anti-hunchback`, `lightweight`,
   `grade-1`; title = original title + suffix; "Old keywords still match ✓" for every original title keyword.
5. Click **Apply**. Say: "No new listing, no duplicate, nothing lost, and one click to undo."

## 5:00–5:40 · Beat 4: The loop closes
1. Back to the buyer tab, run the Beat 1 query again.
2. **Expect** backpack row now shows Minh An Kids Backpack (349,000₫) with badge **Updated for this need**,
   basket still ≤ 1,500,000, Minh An consolidation saving grows.

## 5:40–6:00 · Close
"Built today with Codex: N tickets, M agent runs (see CODEX_LOG.md). Kitly talks to the store through one
adapter, so any marketplace can plug it in."

## Judge-proofing (Q&A rehearsal)
- Judge types an off-catalog need ("adopting a puppy"): plan appears, items show *No suitable product yet*,
  and `/seller` → All shops shows the new need under unmet demand.
- Judge sets a tiny budget ("Grade 1, budget 200k"): status `over_budget` with minimum cost and drivers, never a
  fake basket.
- "Is the data real?": a seeded catalog behind the Commerce Adapter; swap the adapter for a marketplace API.
- After the demo: click **Undo** on the listing so the next run starts clean (or re-seed).
