# 17 — Personalisation UI: persona switch, 💛 cart cards, follow-up questions, answer turns (D39–D43)

**Lane:** 2 · **Target:** after 15 · **Blocked by:** 15, 16 (mock mode on fixtures until 16 is pushed)

**What to build:** the visible half of "the marketplace knows me". Keep it small and clear: it must read in 2 seconds on a
projector.

## Lean
- [ ] **Header persona chip** on every page: "👤 Lan · Cau Giay, Hanoi · 2 vouchers" (from `GET /api/persona`); click ⇒
      menu with **Lan** / **Guest** ⇒ `POST /api/persona`. Inside a kit: small note "Applies to new kits" and a
      "+ New kit" link. Guest chip: "👤 Guest".
- [ ] **💛 In your cart card** under the line (or the "No exact match" row) of `interest.itemKey`: product mini card,
      "520.000₫ → **440.000₫** with LAN-KZ80", "over your 400k limit by 40.000₫" when `overMaxPriceBy`, "missing:
      anti-hunchback" when `missingTags`, button **Switch to this** ⇒ `/api/kit/price` with the pick (same path as Swap:
      over-budget banner + Fit to budget from ticket 15 apply; Undo restores the previous selection). Hidden after the
      switch (the product is now the line).
- [ ] **Wallet savings**: savings lines with `wallet: true` get a 🎟 icon and stay first in the list.
- [ ] **Follow-up** at the end of every assistant message (new kit, refine, answer): the question in bold-ish text and
      the suggestions as pill buttons. Click ⇒ the text appears as a user bubble, then: `action.type === "swap"` ⇒
      `/api/kit/price` (no AI, system line "⚙ Switched backpack to KidZone Lite · Undo"); otherwise ⇒ the composer path
      (`/api/kit/refine`). Pills of older messages are disabled (only the latest follow-up is clickable).
- [ ] **Answer turns**: a stream ending with `done.answered` renders as a normal assistant message (no timeline steps
      beyond "Answering", no version change, kit panel untouched). Loaded threads interleave `versions` and `messages`
      by `createdAt`, so F5 shows every turn.
- [ ] Kit header shows "Deliver to Cau Giay, Hanoi" for Lan (nothing for Guest).

## Full (in addition)
- [ ] Component tests (fixtures): `kit.sample.json` renders the 💛 card with "440.000₫" and "over your 400k limit by
      40.000₫"; the follow-up renders 1 question + its pills and a swap pill calls the price endpoint (fake) not refine;
      `kit.answer.sample.json` adds a message without changing "Version 1 of 1"; a thread with 1 message interleaves it
      after its version; Guest persona hides the address and the chip shows "Guest".
