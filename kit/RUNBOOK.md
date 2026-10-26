# Kitly — Hackathon-day runbook (31 Oct 2026)

Mode for the day: **lean** or **full**, decided after rehearsal (see `../rehearsal/RESULTS.md`).

## Before the day
- [ ] 30/10: each member activates OpenAI API + Codex credits from the setup email; installs the Codex app; logs in to GitHub.
- [ ] Huy: Vercel + Supabase accounts ready (new projects are created on-site, not before).
- [ ] Everyone has this `kit/` folder (private kit repo) on their laptop.

## Timeline
| Time | Lane 1 (Codex, BE/AI/data) | Lane 2 (Codex, FE) | Lane 3 (QA/submission/backup) |
|---|---|---|---|
| 10:00 | read kit; wait 5 min for repo | read kit | create public repo, Vercel + Supabase projects, share env, copy `kit/` + `AGENTS.md` to repo root, push |
| 10:05 | **T00** | wait for T00 push (read PRD/DEMO) | write `SUBMISSION.md` drafts |
| 10:35 | T01 | T10 | start slides |
| 11:30 | T02 | | QA pass 1 (store pages) |
| 11:45 | | T11 (mock mode) | |
| 12:15 | T03 | | |
| 13:15 | T04 | (switch T11 to live) | QA pass 2 (Kitly beat 1) |
| 13:30 | | T12 | |
| 13:45 | T05 | | |
| 14:30 | T06 | | WIP submission |
| 14:45 | | T13 | QA pass 3 (seller) |
| **15:00** | **Decision: is T13 done/near-done and Beats 1–3 working? Yes → T20a / T20b. No → bug-fix only.** | | |
| 15:30 | T20a or fixes | T20b or fixes | full DEMO walk |
| **16:15** | **code freeze** | **code freeze** | re-seed, walk DEMO twice, record numbers for CODEX_LOG |
| 16:30–16:45 | | | **submit** (repo, write-up PDF, demo link, declarations PDF) |

Full mode adds T07, T08 (Lane 1) and T14 (Lane 2) after their blockers; times come from the rehearsal.

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
