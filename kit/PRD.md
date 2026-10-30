# Kitly — PRD

> **Tell Kitly your need, get the whole kit. Sellers see which kits are missing.**

Sea x OpenAI Codex Hackathon · 31 Oct 2026 · Build Direction **02 — AI-Native Products & Operations**.
Companion docs: [CONTRACT.md](CONTRACT.md) (API + types — the source of truth both lanes build against),
[DATA.md](DATA.md) (taxonomy, catalog, planted demo facts), [DEMO.md](DEMO.md) (6-minute script),
[AGENTS.md](AGENTS.md) (rules for the coding agent), [RUNBOOK.md](RUNBOOK.md) (hackathon-day timeline).

---

## Problem Statement

Marketplace search is keyword search: it answers *"which products match these words?"*. Real shopping starts
from a **need**: *"My child starts Grade 1 — what do I need?"*. Today the buyer has to:

1. turn the need into a shopping list themselves (and forget half of it),
2. run one keyword search per item,
3. compare shops, prices, ratings and delivery dates by hand,
4. juggle a budget, shop vouchers, free-shipping thresholds and a deadline in their head,
5. start over when one constraint changes.

On the other side, sellers only see what buyers *bought*, never what buyers *needed and could not find*.
A buyer whose need finds no product leaves no trace. Sellers guess what to stock, and many products that
**do** fit a need stay invisible because their listing does not describe them in the buyer's terms.

## Solution

**Kitly** is an AI layer that plugs into any marketplace (demo: a mini marketplace called **DemoMart**).

**Buyer side, Intent → Plan → Search → Compare → Optimize → Purchase:**
the buyer describes a need in one sentence (English or Vietnamese). Kitly:
- turns it into a **plan**: the item categories needed, quantity, must-have vs nice-to-have, required
  attributes, budget and deadline;
- searches the catalog for each plan item and compares shops (price, rating, reviews, delivery time, shop tier);
- **optimizes the basket** with deterministic code: never over budget, drops items that cannot arrive before
  the deadline, applies the best shop/platform vouchers, and consolidates items into fewer shops to save
  shipping and reach voucher thresholds;
- explains its choices in the buyer's language, streaming each step on a visible timeline;
- works as a **conversation**: chat on the left, the live kit on the right, a Claude-style history of past kits
  (link per kit, survives reload, "+ New kit"). Every refine is a new **version** of the same kit, and the buyer
  can go back to any version;
- **adapts** when the buyer changes a constraint, by chat ("the school gives uniforms, cut budget to 1M") or by
  editing the kit directly (budget, deadline, ✕ remove an item the buyer already owns, swap);
- asks back **only when the budget is missing** (one question with quick choices); every other assumption is shown
  as an editable chip;
- never invents products: a plan item with no exact product shows *"No exact match"* with the **closest** product
  and what it is missing (e.g. *missing: anti-hunchback*), addable with "Add anyway"; the need is still recorded
  as **unmet demand**. Needs the store has no category for are grouped under *"Not in store yet"* with Notify me;
- never blocks a purchase: when the buyer's edits push the basket over budget, Kitly warns, still allows
  "Add to cart", and offers one-click **Fit to budget** suggestions computed by code;
- **knows the buyer** (D39–D46): the marketplace already has the buyer's address, wallet vouchers, favourite shops and
  the products they left in the cart. Kitly applies wallet vouchers automatically, shows a cart product that fits a
  plan item as a *"💛 In your cart"* card (price after their voucher, what it lacks, one click to switch), and knows
  the occasion's real date (Vietnamese school opens Sep 5);
- **keeps the conversation going** like a chat assistant: every answer ends with ONE relevant question and 2–3 quick
  replies, written freely by the model from a code-built *sales context* (days to the deadline → "need express
  delivery?", a cart product on promo, a wallet voucher about to expire, a free-shipping gap). The buyer can also just
  ask questions ("is this backpack really anti-hunchback?"): Kitly answers without changing the kit.

**Seller side, Seller Intelligence:**
aggregated intent data becomes a dashboard per shop:
- **Unmet demand**: needs buyers asked for that the catalog could not satisfy, with weekly counts, trend,
  and the price band buyers accept.
- Two kinds of gap:
  - **Listing gap**: the shop already sells a product that fits, but its listing does not say so.
    Kitly proposes an **additive enrichment** (attributes, tags, title suffix, description paragraph) that keeps
    every existing keyword, shows *what is added / what is kept / old keywords still match ✓*, applies it in
    one click and can **undo** it. No duplicate listing (marketplaces penalise duplicates).
  - **Assortment gap**: nobody sells it. A decision-support card (demand size, trend, price band, items it is
    bought with, number of shops selling = 0). No "add product" button: stocking is a real-world decision.
- **Frequently-needed-together combos** and **trends**.

**The loop, live:** buyer need → unmet demand → seller fixes listing → the same buyer query now finds the
product, badged *"Updated for this need"*.

**Pluggable:** all AI logic talks to the marketplace through one **Commerce Adapter** interface (search
products, get shops, get vouchers, update listing, record demand). DemoMart implements it on Supabase; any
marketplace can implement it against its own API.

## User Stories

### Buyer: intent and plan
1. As a buyer, I want to describe my need in one sentence, so that I don't have to build a shopping list myself.
2. As a buyer, I want to write in Vietnamese or English, so that I can use my natural language.
3. As a buyer, I want to see the plan Kitly made (categories, quantity, must-have vs nice-to-have), so that I can trust it understood me.
4. As a buyer, I want my budget and deadline extracted from my sentence, so that I don't fill a form.
5. As a buyer, I want Kitly to state the assumptions it made (e.g. "assumed 1 child"), so that I can correct them.
6. As a buyer, I want to see each step happening (understanding → planning → searching N products → optimizing → explaining), so that waiting feels short and I see the AI working.
7. As a buyer whose need is outside the store's coverage, I want an honest plan: uncovered items under "Not in store yet", items with no exact match shown as "No exact match" with the closest product and what it lacks, so that I'm never shown a wrong product as a match.

### Buyer: compare and optimize
8. As a buyer, I want each plan item to show the chosen product and 1–2 alternatives from other shops, so that I can compare.
9. As a buyer, I want the basket total to never exceed my budget, so that I can trust the numbers.
10. As a buyer, I want must-have items prioritized over nice-to-have items when money is tight, so that essentials are covered.
11. As a buyer, I want products that cannot arrive before my deadline excluded, so that everything arrives in time.
12. As a buyer, I want shop vouchers, platform vouchers and free-shipping thresholds applied automatically, so that I pay the least.
13. As a buyer, I want items consolidated into fewer shops when that saves money, so that I pay less shipping.
14. As a buyer, I want a savings breakdown ("Buy 4 items at Minh An Stationery: save 62,000₫"), so that I see why the basket is built this way.
15. As a buyer, if the must-haves cannot fit the budget, I want to be told the minimum cost and what drives it, so that I'm never silently over budget.
16. As a buyer, I want a short explanation of why each product was picked, in my language, so that I understand trade-offs.
17. As a buyer, I want three baskets (Saver = lowest total / Balanced = best value / Premium = top-rated within budget), each labelled with its meaning and total, so that I choose my trade-off. Identical baskets are merged.

### Buyer: adapt and purchase
18. As a buyer, I want to change a constraint in plain language ("school provides uniforms, budget 1M now"), so that the plan updates without starting over.
19. As a buyer, I want to see what changed (removed / added / swapped items and new total), so that I can follow the adaptation.
20. As a buyer, I want to swap a chosen product for one of its alternatives, so that I keep control.
21. As a buyer, I want to add the whole basket to the cart in one click, so that purchase is fast.
22. As a buyer, I want a checkout confirmation page (no real payment), so that the flow ends naturally.
23. As a buyer, I want products updated for my need to be badged "Updated for this need", so that I see the store improving.
24. *(Full / stretch)* As a buyer, I want "Notify me when available" on an unmet item, so that I hear when a seller stocks it.

### Buyer: conversation, history and edits (added 30/10 after team review)
44. As a buyer, I want to keep chatting with Kitly about my kit (like a chat assistant), so that I refine it step by step.
45. As a buyer, I want every kit I made listed in a sidebar, each with its own link, and a reload to keep my kit, so that I never lose work.
46. As a buyer, I want to go back to an earlier version of my kit, so that a refine never destroys what I had.
47. As a buyer who did not state a budget, I want Kitly to ask for it with quick choices, so that the kit fits my wallet.
48. As a buyer, I want to edit Kitly's assumptions, budget and deadline directly, so that I correct it without retyping.
49. As a buyer, I want to remove an item I already own and have it stay removed, so that the kit only has what I need.
50. As a buyer, when no product matches exactly, I want the closest product and what it lacks, and to add it anyway, so that I can still buy.
51. As a buyer, I want to add my basket even when it is over budget, with a warning and suggestions to fit the budget, so that I am never blocked.

### Buyer: the marketplace knows me (added 30/10 night, D39–D48)
52. As a buyer, I want my wallet vouchers applied to the kit automatically and labelled as mine, so that I pay the least without searching my wallet.
53. As a buyer, I want a product I left in my cart to show up when it fits my kit, with its price after my voucher and what it lacks, so that I can decide to finally buy it.
54. As a buyer, I want Kitly to know the real date of my occasion (school opens Sep 5) and tell me when time is short, so that things arrive in time.
55. As a buyer, I want every Kitly answer to end with a useful question and quick replies, so that I keep going without thinking what to type.
56. As a buyer, I want to ask Kitly questions about my kit without it rebuilding the kit, so that chatting feels natural.
57. As the presenter, I want to switch between the demo buyer (Lan) and a Guest, so that judges see what personalisation adds on the same sentence.

### Buyer: classic store
25. As a buyer, I want a normal storefront (home, keyword search, category browse, product detail, cart), so that Kitly is clearly a layer on top of a regular marketplace.
26. As a buyer, I want product cards with price, rating, review count, sold count, shop tier and voucher badges, so that I can scan quickly.

### Seller Intelligence
27. As a seller, I want to pick my shop and see insights for it, so that the dashboard is about my business.
28. As a seller, I want a list of unmet demand with this-week vs last-week counts, so that I see what buyers want and can't find.
29. As a seller, I want each gap labelled as Listing gap or Assortment gap, so that I know whether to fix a listing or consider stocking.
30. As a seller, I want the accepted price band (p25–p75 of buyers' budget hints) for each gap, so that I price correctly.
31. As a seller, I want to see which categories are needed together with a gap, so that I can bundle.
32. As a seller, I want a one-sentence AI recommendation per gap, so that I know what to do.
33. As a seller with a listing gap, I want to see which of my products fits and the evidence from my own description, so that I trust the match.
34. As a seller, I want a preview of the enrichment showing added / kept parts and that my old keywords still match, so that I don't lose existing search traffic.
35. As a seller, I want to apply the enrichment in one click, so that the fix takes seconds.
36. As a seller, I want to undo an enrichment, so that I never lose my original listing.
37. As a seller, I want the marketplace-wide view of top needs and combos, so that I spot trends beyond my shop.
38. As a seller, I want counts to update when new buyer queries arrive, and a "Just searched" live strip showing the newest unmet needs (even single ones), so that the data feels live.
39. *(Full / stretch)* As a seller, I want to see how many buyers are waiting ("Notify me") on an assortment gap, so that I can commit to stocking.

### Platform and demo
40. As the platform, I want all Kitly logic to depend only on the Commerce Adapter, so that it can plug into any marketplace.
41. As the presenter, I want a fixed "demo today" date, so that deadlines in the script behave the same every run.
42. As the presenter, I want the app deployed on a public URL, so that judges can try it themselves.
43. As a judge, I want to type my own need and get a sensible plan (or an honest gap), so that I can trust it is not scripted.

## Implementation Decisions

**Stack.** Next.js (App Router, TypeScript, Tailwind) single repo, deployed on Vercel. Supabase Postgres for
data. OpenAI Responses API with Structured Outputs (JSON schema) for every LLM call. Vitest for tests;
Playwright for the Full-mode end-to-end test. No other heavy dependencies.

**Models (env-configurable).** `KITLY_MODEL_PLANNER` default `gpt-6-luna` (understanding + plan + refine) with
`KITLY_PLANNER_EFFORT` default `low` (sent as `reasoning.effort`). `KITLY_MODEL_FAST` default `gpt-6-luna` with
`KITLY_FAST_EFFORT` default `low` (explanations, seller advice, enrichment drafts, listing-fit judgement, catalog
generation). Measured 30/10 with the real key: `gpt-6.1-sol` planner 12–13 s; `gpt-6-luna` passes the 9/9 eval;
effort `none` breaks plans (2 items) — never use it. Target: basket visible ≤ 10 s after Run for the hero sentence.

**Modules (deep modules, small interfaces).**
- **Commerce Adapter**: the only door to marketplace data. Two implementations: Supabase (production) and
  In-memory (tests + Lane 2 mock mode). Interface is defined in CONTRACT.md.
- **Planner**: need text (+ optional previous plan and change message) → `KitPlan`. LLM, structured output,
  categories constrained to the taxonomy enum plus `null` for uncovered needs. Code-enforced rules (the prompt
  asks for them, code guarantees them after parsing, so results are stable run to run):
  - **Must-have tags** (`mustHaveTags`) hold only attributes the buyer explicitly said for THAT item. Hero
    sentence: only the backpack item gets `mustHaveTags = ["anti-hunchback"]`; every other item has `[]`.
  - **Context tags** `grade-1 kids newborn-0-3m budget premium gift-wrapped eco-friendly` are never must-have:
    code moves them from `mustHaveTags` to `niceToHaveTags` on every item.
  - **Quantity**: set/pack-type items (book covers, pens, notebooks sets, crayons/paints, wipes, diapers, …) =
    quantity 1 (one pack). `quantity > 1` only when the buyer says so or for clothing that is worn in rotation
    (uniform = 2). Code clamps every `quantity` to `1..3`.
  - **Retry**: one automatic retry when structured output is invalid or the call fails with a network error; only
    then an `error` event with code `llm_error`.
- **Matcher**: plan item + adapter → scored candidates. Pure code. ONE catalog query for the whole plan
  (`searchProducts({ categories })`). Filters: category, deadline (DEMO_TODAY + ship_days_max ≤ deadline), in stock,
  must-have tags, `maxUnitPrice`. **Score = quality only** (CONTRACT §1: tags, rating, reviews, tier; never price).
  No exact candidate → reason code + **closest** (relax must-have tags, then max price; never deadline or stock).
- **Optimizer**: plan + candidates + vouchers + shops + profile → `BasketOption`. Pure code, deterministic.
  Algorithm: decide the item set first (must-haves forced, nice-to-haves dropped lowest score-per-₫ first until
  the cheapest basket fits) — the SAME item set for every profile — then per profile pick one candidate per item:
  saver = lowest grand total, premium = highest Σscore within budget, balanced = Σscore − α·cost (CONTRACT §1
  "Profiles", with invariants). Every state is priced exactly (per-shop shipping, FREESHIP, best shop voucher meeting
  min spend, single best platform voucher), so consolidation into fewer shops is chosen whenever it pays.
  If must-haves alone exceed budget, returns `status: "over_budget"` with minimum cost, cost drivers, `overBy` and
  `fit` suggestions. Never returns a basket over budget with `status: "ok"`.
  `priceSelection(plan, candidates, selection)` (pure) re-prices a buyer-edited basket (swaps, Add anyway, drops) and
  computes `fit` suggestions when it is over budget (CONTRACT `FitSuggestion`).
- **Explainer**: plan + chosen option → streamed text in the buyer's language, **short: ≤ 70 words and ≤ 4 sentences**
  (prompt states the limit; a unit test asserts the prompt contains it). It may mention wallet savings and the cart card,
  using only numbers it is given.
- **Persona + Sales context** (D39–D46, pure code): `getPersona` through the adapter (cookie `kitly_persona`, copied onto
  the thread). Wallet vouchers enter the Optimizer like any voucher. `findInterests(plan, option, persona, …)` builds
  the 💛 cards. `buildSalesContext(plan, option, persona, vouchers, today)` lists the facts + hooks (CONTRACT `SalesContext`).
- **Follow-up** (D41): one structured fast-model call, run **in parallel** with the Explainer, writes `FollowUp`
  (question + 2–3 suggestions) freely from the sales context and the last user message; a code **guard** rejects any
  number / voucher code / date not in the context and falls back to a code template of the first hook. Never fails
  the kit. Suggestions tied to a cart interest carry a code-made swap action.
- **Answer turns** (D42): in refine, the planner's `intent` decides; `answer` → fast model answers from the current
  version + product facts + sales context, then a follow-up; saved as a `KitMessage`, no new version, no demand.
- **Kit Pipeline**: orchestrates Planner → (clarify if no budget) → Matcher → Optimizer → Explainer ∥ Follow-up, emits SSE
  events, records an intent session + demand items through the adapter, and saves each run as a `KitVersion` in the
  **KitStore** (threads owned by the `kitly_uid` cookie). `adjust` (budget, deadline, remove/restore item, restore
  version) and `price` (selection) are code-only and answer in < 1 s.
- **Insights**: SQL aggregation over demand items (unmet = plan item with fewer than 2 matching products);
  listing-gap detection = for an unmet demand item, products of the selected shop in the same category within
  the price band whose listed attributes lack the needed tags. The fast model judges whether the product
  description supports those tags (yes/no + evidence quote). Advice sentences are generated by the fast model
  and cached by gap key.
- **Enrichment**: `proposeEnrichment` (fast model drafts additions, constrained to tags supported by
  evidence) and a pure `mergeEnrichment(listing, proposal)` that is additive only (original title kept
  verbatim as a prefix, max title length 120, tags/attributes union, description appended), plus
  `keywordCheck(oldListing, newListing)`. Apply snapshots the old listing into `product_versions`; Undo restores
  the latest snapshot.

**Schema** (Supabase, full DDL in DATA.md): `shops`, `products`, `product_versions`, `vouchers` (+ `owner_persona`),
`personas`, `intent_sessions`, `demand_items`, `insight_advice`, `demand_watches` (Full), `kit_threads`, `kit_versions`,
`kit_messages`.

**API contract.** See CONTRACT.md. Key endpoints: `POST /api/kit` (SSE), `POST /api/kit/refine` (SSE),
`GET /api/products`, `GET /api/products/:id`, `GET /api/shops`, `GET /api/seller/insights`,
`POST /api/seller/enrichment/preview`, `POST /api/seller/enrichment/apply`,
`POST /api/seller/enrichment/undo`, `POST /api/demand/watch` (Full).

**`options[]` from day one.** Kit responses always return an array of basket options. Lean returns one
(`balanced`); the 3-basket stretch returns `saver`, `balanced`, `premium` with no UI contract change.

**UI.** English UI; AI text follows the buyer's language. No product photos: each category has an icon and
a colour (defined in DATA.md). Pages: Store home, Search results, Category, Product detail, Cart, Checkout
confirmation, Kitly (intent mode, reached from a toggle on the search bar "Describe your need"; routes `/kit`
→ latest kit of this browser or `/kit/new`, `/kit/new?q=` runs a new kit, `/kit/t/<threadId>` = one kit),
Seller Intelligence (`/seller`, reached from a small "Seller Centre" link in the header — the Kitly screen itself
has no seller buttons, D37). **Kitly layout (D30):** history sidebar (collapsible) · chat column (messages, live
timeline inside the in-flight answer, assumption chips, clarify choices, action lines with Undo, composer) · kit
panel (budget/deadline editable, version switcher, Saver/Balanced/Premium tabs with meaning + total, lines with
swap/✕, "No exact match" rows with closest + Add anyway, 💛 "In your cart" cards, "Not in store yet" block, totals with
wallet savings, over-budget warning + Fit to budget, Add kit to cart). Every assistant message ends with the follow-up
question + quick-reply buttons. Header: persona chip "👤 Lan · Cau Giay, Hanoi · 2 vouchers" with a Lan ⇄ Guest switch
(D43). Mobile: Chat / Kit tabs. Live only, no cache, no fallback video: robustness comes from the timeline and
honest error states.

**Time.** `DEMO_TODAY` env (default `2026-09-02`, D45) is "today" for deadlines and weekly windows. The planner prompt
states today's date and "Vietnamese school year opens Sep 5".

**Lanes (hackathon day).** Lane 1: backend + AI + data. Lane 2: frontend. Lane 3: QA, write-up, slides,
backup credits. Folder ownership in AGENTS.md. CONTRACT.md is frozen after ticket 00; only Lane 1 may change
it, and must tell Lane 2.

## Testing Decisions

A good test exercises a public interface with realistic inputs and asserts observable behaviour (money,
membership, ordering, event sequence). No tests of private helpers, no mocking of our own modules. The only
fakes allowed: the LLM client (a fake returning fixed structured outputs) and the Commerce Adapter (the
In-memory implementation, which is a real implementation, not a mock).

| Seam | Interface | Mode | Must prove |
|---|---|---|---|
| S1 | Optimizer | Lean + Full | total ≤ budget whenever status ok; totals add up (items + shipping − vouchers); voucher min-spend respected; free-ship threshold respected; late items excluded; must-haves before nice-to-haves; over_budget path; consolidation picks fewer shops when cheaper |
| S2 | `POST /api/kit` handler with In-memory adapter + fake LLM | Lean + Full | event order (step… → plan → options → explanation → done); response matches contract schema; uncovered item → `noMatch` + demand item recorded with matched_count 0 |
| S3 | Insights service on In-memory adapter seeded with fixtures | Lean + Full | weekly counts; unmet threshold; listing vs assortment classification; shop filter; price band |
| S4 | `mergeEnrichment` + `keywordCheck` + apply/undo through adapter | Lean + Full | original title preserved; additive only; all old keywords still match; undo restores exact previous listing |
| S5 | Matcher | Full | deadline filter, must-have attribute filter, score ordering |
| S6 | Refine + adjust + KitStore | Lean + Full | diff (added/removed/swapped) correct; previous plan honored; excluded items never come back; versions append; another cookie gets 404 |
| S9 | `priceSelection` + fit suggestions | Lean + Full | totals add up for any selection; over budget ⇒ `overBy` + ≤ 2 `fit`; applying a `fits: true` suggestion gives grandTotal ≤ budget; must-haves dropped only when nothing else fits |
| S10 | Persona + sales context + follow-up guard + answer turns (InMemory + FakeLLM) | Lean + Full | Lan's wallet voucher applied and labelled, Guest gets none; hero kit has the KidZone Lite interest 440k / over by 40k; hooks for the hero kit; guard replaces a follow-up citing an unknown price/code; LLM failure ⇒ template follow-up, kit still `done`; `intent: "answer"` ⇒ no new version, message saved |
| S7 | Playwright e2e of DEMO.md script against the running app with the real DB | Full | every demo beat works end to end |
| S8 | LLM eval script (not in CI): 6 event queries + 3 off-coverage queries against the real model | Full | each plan has ≥ 5 items mapped to the right event categories; off-coverage queries produce `null` categories, not wrong ones |

Commands: `npm test` (Vitest, must be green before every commit), `npm run build`, `npm run e2e` (Full),
`npm run eval` (Full, manual).

## Out of Scope

Real payments, user accounts/auth (history is per browser cookie; accounts are the production answer), real marketplace APIs, product images, scraping, multi-marketplace price
comparison, recommendation ML training, mobile app, i18n of UI chrome, caching/fallback of LLM results,
inventory/stocking workflows for sellers, creating new listings, duplicate listings, seller business KPIs
(sales/traffic dashboards), shop browsing from a recommendation, an intent-aware cart that flags off-need items
(all three are Q&A "next steps", 30/10 D26), real personalisation (more than one demo persona, learning from history),
seller use of cart data ("18 buyers left your backpack in the cart", D47), delivery times that depend on the address,
paid express shipping options (D44).

Ops (optional, not a feature): a shared demo link can be put behind HTTP Basic Auth with the env var
`KITLY_BASIC_AUTH=user:pass` (see RUNBOOK.md) so teammates can view it without burning the LLM key.

## Further Notes

- Hackathon rules: all code is written on-site in a new public repo. This kit (docs only, no code) was prepared
  beforehand and is declared in the Declarations PDF.
- Judges are mostly Shopee product people: keep marketplace mechanics (vouchers, free-ship thresholds, shop
  tiers, listing quality) realistic.
- Judging: problem/solution fit, build quality ("we judge the product, not the pitch"), originality,
  real-world value, build-direction alignment, **use of Codex**. Keep a `CODEX_LOG.md` in the repo: which
  tickets Codex built, how many runs, notable fixes.
