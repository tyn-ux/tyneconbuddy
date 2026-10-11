# Long Qs AI marking: deploy (BUILD 2026-10-11a)

The full `Code.gs` to paste is in the project files (apps-script/longq/Code.gs): the dashboard version (PR #9, which already includes PR #7's fixes) + one line in `doPost` + BUILD bump. `LongQMark.gs` is a new, second file.

1. Open the Apps Script project (Sheet > Extensions > Apps Script).
2. `Code.gs`: select all, paste this folder's `Code.gs`, Save.
3. Click **+** next to Files > Script, name it `LongQMark`, paste `LongQMark.gs`, Save.
4. Run `testLqMark` once. The log should show an AI mark and feedback (it uses 1 of the teacher-test quota). If it says "AI marking is not switched on", GEMINI_KEY is missing; if "unavailable", read AI_LAST_ERROR in Project Settings > Script Properties.
5. Deploy > Manage deployments > pencil > Version: **New version** > Deploy. Same deployment, so the /exec URL does not change.
6. Open `<your /exec URL>?ping=1` and check build `2026-10-11a`.

Do **not** run `install()`.

## What you get in the Sheet
- **LQMarks** tab: every AI marking (time, student id, question, typed/photo, AI mark, feedback, what it read). Photos are not stored.
- **LQUsage** tab: marks used per student per day. Cap is `LQ_DAILY_CAP = 10` at the top of LongQMark.gs.
