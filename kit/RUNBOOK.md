# Kitly — Hackathon-day runbook (31 Oct 2026)

Mode for the day: **full** (D25), kit revised 30/10 after the team review (D26–D38) and the personalisation grill (D39–D48).

## Before the day
- [ ] 30/10: each member activates OpenAI API + Codex credits from the setup email; installs the Codex app; logs in to GitHub.
- [ ] Huy: Vercel + Supabase accounts ready (new projects are created on-site, not before).
- [ ] Everyone has this `kit/` folder (private kit repo) on their laptop.

## Timeline
Mode: **full** (D25). Ticket order after 30/10 (D26–D48): Lane 1 `00 01 02 03 04 09 16 05 06 07 08 20a`,
Lane 2 `10 11 15 17 12 13 14 20b`. Times below are targets; replace them with the numbers from
`../rehearsal/RESULTS-full-2.md` (rehearsal 30→31/10) when they differ.

| Time | Lane 1 (Codex, BE/AI/data) | Lane 2 (Codex, FE) | Lane 3 (QA/submission/backup) |
|---|---|---|---|
| 10:00 | read kit; wait 5 min for repo | read kit | create public repo, Vercel + Supabase projects, share env, copy `kit/` + `AGENTS.md` to repo root, push |
| 10:05 | **T00** | wait for T00 push (read PRD/DEMO) | write `SUBMISSION.md` drafts |
| 10:40 | T01 | T10 | start slides |
| 11:35 | T02 | | QA pass 1 (store pages) |
| 11:50 | | T11 (mock mode) | |
| 12:20 | T03 | | |
| 13:20 | T04 | | QA pass 2 (Kitly beat 1, reload, history) |
| 13:45 | T09 | (switch T11 to live) T15 | |
| 14:15 | **T16** (persona, 💛 cards, follow-up, answers) | | |
| 14:30 | | **T17** (mock mode until T16 is pushed) | QA pass 3 (Lan vs Guest, follow-up pills) |
| 15:00 | T05 | | |
| 15:05 | | T12 | WIP submission |
| 15:25 | T06 | | |
| 15:35 | | T13 | QA pass 4 (seller + live strip) |
| **15:45** | **Decision: Beats 1–4 working? Yes → T20a/T08/T07 · T14/T20b. No → bug-fix only.** | | |
| 15:45 | T20a, T08, T07 or fixes | T20b, T14 or fixes | full DEMO walk |
| **16:15** | **code freeze** | **code freeze** | re-seed, walk DEMO twice, record numbers for CODEX_LOG |
| 16:30–16:45 | | | **submit** (repo, write-up PDF, demo link, declarations PDF) |

**Cut line if late (in this order):** T07 Notify me → T14 e2e → T20b polish → the version switcher's "Restore" in T11 →
assumption-chip editing in T15. Never cut: closest match (T03), 3-basket fix (T02), threads + reload (T03/T09/T11), live
strip (T05/T12), **personalisation T16/T17 (D48: Lan, wallet, 💛 card, follow-up, answer turns)** — the demo depends on them.

**Lane 3 blocker loop (hourly).** Lane 3 reads `BLOCKERS.md` every hour, turns each open line into a small ticket
(`kit/tickets/9x-<slug>.md`: one paragraph, acceptance check, "Lane 1" or "Lane 2") and hands it to the lane that owns
the folders involved, ahead of that lane's next ticket. Resolved lines are deleted from `BLOCKERS.md` in the same commit.


## How to hand a ticket to Codex
Paste exactly (change lane/mode/ticket):
```
You are Lane <1|2>, mode <lean|full>. Read AGENTS.md, then kit/PRD.md, kit/CONTRACT.md, kit/DATA.md, kit/DEMO.md.
Implement ONLY kit/tickets/<NN-file>.md. Follow AGENTS.md exactly: tests first at the named seams,
npm test + npm run build green, commit "T<NN>: …", pull --rebase, push, append to CODEX_LOG.md.
```
When Codex finishes: read its final message, check `npm test` yourself, open the app, then next ticket.
If a run goes off the rails for > 15 min: stop it, `git reset --hard origin/main`, re-run with a sharper note.

## Credits
Rehearsal numbers (per ticket, per lane) live in `../rehearsal/RESULTS.md`. If a lane passes ~80% of its
estimate before 14:30, Lane 3 takes the next ticket on its account.

## Optional: private demo link (Basic Auth)
To share the deployed URL with teammates without letting strangers spend the LLM key, set the env var
`KITLY_BASIC_AUTH=user:pass` (Vercel project settings). When it is set, a Next.js middleware (`src/middleware.ts`)
answers every request (pages and `/api/*`) with `401` + `WWW-Authenticate: Basic` unless the `Authorization: Basic …`
header matches; when it is unset, the middleware does nothing. Remove the variable before the judges' link goes
into the submission. The credentials are never committed (env only).
