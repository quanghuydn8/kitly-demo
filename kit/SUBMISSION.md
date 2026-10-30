# Kitly — Submission drafts

## Write-up (→ PDF)
**Problem.** Marketplace search is keyword-in, product-out. Real shopping starts from a need ("my child starts
Grade 1"), so buyers build lists, compare shops, do voucher and shipping maths and still miss deadlines.
Sellers never see the needs they failed to serve.

**Solution.** Kitly, an AI layer any marketplace plugs in via one Commerce Adapter.
Buyer: Intent → Plan → Search → Compare → Optimize → Purchase, adapting in plain language, never over
budget, never inventing products. Seller: unmet demand becomes Seller Intelligence; listing gaps are fixed
additively in one click (no duplicates, old keywords kept, undoable); assortment gaps inform stocking.
The loop closes live: a fixed listing is found by the very query that exposed the gap.

**Why it matters / who benefits.** Buyers: one sentence to a complete, on-time, cheapest-valid kit.
Sellers: demand they could not see, and a fix for invisible products. Platform: higher conversion on
need-based sessions and better assortment.

**Build Direction.** 02, AI-Native Products & Operations: need-to-kit shopping and demand-driven listing
repair were not realistically possible with keyword search.

**Design choices.** LLM for understanding and language (plan, explanation, evidence, advice); deterministic code
for money (knapsack + shop consolidation + voucher rules), so totals are always correct and testable.

**Use of Codex.** <fill from CODEX_LOG.md: N tickets, M runs, tests written by Codex, % of code by Codex,
what we corrected by hand>.

## Declarations (→ PDF)
- Starting point: an empty repository created on 31 Oct 2026 at the venue.
- Prepared before the event (no code): planning documents in `kit/` (PRD, API contract, data spec, demo
  script, tickets, runbook). These describe what to build; all source code, data-generation scripts,
  seeded data and the deployment were produced on-site during the hackathon, primarily by Codex.
- Open-source libraries used: Next.js, React, Tailwind CSS, lucide-react, zod, OpenAI SDK, supabase-js,
  Vitest, Playwright (if full mode).
- No existing personal or open-source project code was reused.
