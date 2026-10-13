# E-points, store and classes: deploy (BUILD 2026-10-13a)

## Update 2026-10-13: 20 items per store category
If you already deployed 2026-10-12e, only this is needed:
1. Apps Script: paste the new `Code.gs` (BUILD bump) and the new `EPoints.gs`, Save.
2. Sheet: tyneconbuddy > **Set up E-point tabs**. It adds the 58 new items to the
   bottom of **EStore**. Rows already there, and any prices you changed, stay as they are.
3. Deploy > Manage deployments > pencil > New version > Deploy; `?ping=1` shows `2026-10-13a`.

To stop selling an item, set its "on sale" to `no`. Don't delete the row:
the next "Set up E-point tabs" would add it back.

## First-time deploy

This builds on the Correction Album version (BUILD 2026-10-12a). If you have
not pasted that one yet, this one includes it, so do these steps once.

1. Open the Sheet > Extensions > Apps Script.
2. `Code.gs`: select all, paste `apps-script/Code.gs`, Save.
3. `LongQMark`: select all, paste `apps-script/LongQMark.gs`, Save.
4. New file: click **+** next to Files > Script, name it `EPoints`, paste
   `apps-script/EPoints.gs`, Save.
5. Go back to the Sheet and reload it. A **tyneconbuddy** menu appears at the top.
6. tyneconbuddy > **Set up E-point tabs**. Google asks you to allow access the
   first time. This makes the new tabs; every class already in Students is
   added to **Classes** as open. Check that list.
7. Apps Script: Deploy > Manage deployments > pencil > Version: **New version** > Deploy.
8. Open `<your /exec URL>?ping=1` and check build `2026-10-13a`.

Do **not** run `install()`.

## What students see
- An **E** balance at the top right. Tapping it opens the **E-Store**.
- Home: **My character** (pick the free teen boy or girl first) and a
  **Class** card with every classmate's character, nickname and level.
  A student can switch to any open class. No email, class number or score is shown.
- E-Store: animals, outfits, Hong Kong backgrounds and effects. Two taps to buy.
  The "How to earn E" table shows today's count against each limit.
- The class is now picked from a list (the classes open in the Classes tab).

## Running it from the Sheet (menu or by typing in the tabs)
| Want to | Do |
|---|---|
| Open a class | Menu > Open a new class, or add a row `4C · open` in Classes |
| Archive a class | Menu > Archive a class, or set its status to `archived`. It leaves the site; records stay |
| Hide / unhide a student | Menu > Hide or unhide, or type `hidden` in Students column H. Not on class pages or the leaderboard; can still practise |
| Remove a student from a class | Menu > Remove, or type `removed` in Students column H. They keep points and history and pick a class again at next sign-in |
| Give or take E | Menu > Give or take E-points (`5A-12, 30, reason`), or a row in EGive (applied from the menu, or when that student next opens the site) |
| Change points or limits | Edit ERules. `per_day` 0 = no daily limit, `on` = no switches it off |
| Change prices | Edit EStore: price, on sale, names. Ids must stay the same (the page draws them) |
| Fix a balance by hand | Edit ELedger, then Menu > Recount balances from ELedger |

Changes in the tabs reach students within about two minutes. No redeploy needed.

## How points are counted
The server works every award out from what happened, against ERules. The page
cannot send a number of points. There is no overall daily cap (your choice);
each activity has its own limit:

- MC answer +1, correct +1 (first answer to each question per day, 40 a day)
- Every 10 MC answered in a day +5 (4 a day)
- Fix a wrong MC after 5 other questions or 10 minutes +3 (once per question)
- Long Q sent for AI marking, 40+ words or a photo, +8 (4 a day); beat your last AI score +10
- Each marking point put in the Correction Album +2 (10 a day, once per point ever)
- Album MC retry right a day or more after the mistake +4 (once per question)
- Comment on a question, 15+ characters, +3 (3 a day). Hiding it takes the 3 back
- Your verified tick on a comment +10
- Practise on 5 days in a week +20

Correctness of an MC answer is decided in the student's browser (it has the
answer key, as before), so a student who edits the page could claim "correct"
more often. The limits above cap what that can earn in a day.

## New tabs
Wallet (server's working copy, don't edit), ELedger, ERules, EStore, Classes,
EGive. Students gets a `status` column (H).
