# BLOCKERS

One line per open blocker: `<date> | lane | ticket | what is missing | who can unblock`. Lane 3 reads this hourly.

2026-10-31 | 1 | 03 (found by T08 eval) | planner returns ONE item ("Guitar", null) for "learning guitar" (3/3 runs, gpt-6-luna low) — S8 wants ≥ 5 items for off-coverage; plannerRules only asks for a full kit for back_to_school/tet_gifts. Needs a T03 follow-up to the prompt ("list the usual items even when no category fits"). Not a blocker for the demo (puppy/wedding pass) | Lane 1 (T03 follow-up)
2026-10-31 | 2 | 13 (demo walk) | Supabase schema kitly_lean is seeded for an older DEMO_TODAY: every demand row is ≤ 2026-08-19, so /seller (window 08-27…09-02) shows 0 gaps/combos/top needs. Needs `npm run seed` with DEMO_TODAY=2026-09-02 before the round (not run from Lane 2: shared DB, Lane 1 owns seed). T13 walk used KITLY_ADAPTER=memory | Lane 1
2026-10-31 | 2 | 13 (demo walk) | EN explainer prints the raw ISO deadline ("All listed items arrive by your 2026-09-05 deadline") — should read "Sep 5". Fit to budget on a 1.2M kit with the 890k backpack offers only "Drop backpack (removes a must-have)", no cheaper-backpack swap. Not demo blockers | Lane 1 (T03 explainer / T02 fit)
