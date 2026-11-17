# E-Store collection + pets: deploy

This adds rarity tiers, Legendary/Mythic items with learning unlocks, theme sets with badges, titles, a Collection page and pets that sit beside each MC question.

This folder already includes the class-list gate from PR #47 (`Access.gs`), so merge **PR #47 first**, then the pets PR.

## 1. Paste (replace ALL files from this same folder)
In the Apps Script editor, replace every file with the copy from this folder:
`Code.gs`, `EPoints.gs`, `LongQMark.gs`, `TeacherMark.gs`, `Access.gs` (add it with ＋ → Script → `Access` if you don't have it yet).
Do not mix with older copies. Do NOT run install().

## 2. Deploy
Deploy → Manage deployments → pencil → Version: New version → Deploy (same deployment).
`SYNC_URL?ping=1` should show build `2026-11-17a`.

## 3. Add the new items to the store
In the Sheet: reload, then **tyneconbuddy → Set up E-point tabs**.
This adds 30 new rows at the bottom of **EStore** and three new columns:
- **tier**: common / rare / epic / legendary / mythic (blank = from the price)
- **unlock**: what a student must have done before buying, e.g. `chap:80:40` = 80% right in any chapter with 40+ MCQs; `mc:200` = 200 MCQs answered; `streak:30`; `lq:5`; `sets:3`; rules joined with `+`
- **sale window**: e.g. `12-01..12-31` = only on sale in December (festival items)

You can change any price, tier, unlock or window in the tab. To stop selling an item, set "on sale" to `no`.

## What students see
- Store: new tabs **Pets**, **Titles**, **Collection**; every card has its rarity frame; locked cards say what they need and how far the student is.
- Pets: buy an egg (300–600 E), press "Bring along". It hatches after 20 MCQs, teen at 100, adult at 400; sleepy after 3 days away, awake again on the next answer.
- MC drill: the pet sits beside the question and reacts to each answer.
- Class page: rarity frame, pet, title and set badges next to each nickname.
