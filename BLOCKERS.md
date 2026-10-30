# BLOCKERS

One line per open blocker: `<date> | lane | ticket | what is missing | who can unblock`. Lane 3 reads this hourly.

2026-10-31 | 1 | 03 (found by T08 eval) | planner returns ONE item ("Guitar", null) for "learning guitar" (3/3 runs, gpt-6-luna low) — S8 wants ≥ 5 items for off-coverage; plannerRules only asks for a full kit for back_to_school/tet_gifts. Needs a T03 follow-up to the prompt ("list the usual items even when no category fits"). Not a blocker for the demo (puppy/wedding pass) | Lane 1 (T03 follow-up)
