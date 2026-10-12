# Correction Album upgrade: deploy (BUILD 2026-10-12a)

`Code.gs` here is the Long Qs version (BUILD 2026-10-11a, which already has the
dashboard and login fixes) plus the Correction Album additions. `LongQMark.gs`
is unchanged. If you have not pasted the Long Qs version yet, this one
includes it, so you only need to do the steps below once.

1. Open the Apps Script project (Sheet > Extensions > Apps Script).
2. `Code.gs`: select all, paste `apps-script/Code.gs`, Save.
3. If there is no `LongQMark` file yet: click **+** next to Files > Script,
   name it `LongQMark`, paste `apps-script/LongQMark.gs`, Save.
4. Deploy > Manage deployments > pencil > Version: **New version** > Deploy.
   Same deployment, so the /exec URL does not change.
5. Open `<your /exec URL>?ping=1` and check build `2026-10-12a`.

Do **not** run `install()`.

## What changes in the Sheet
- New **LQAlbum** tab (made by itself on the first save): one row per student
  per Long Q they put in their album. Columns: uid, key, score (last), out_of,
  missing (points still to fix, JSON), fixed (points earned on a later try),
  note, status, tries, history (every try: time, score, ai/self), added, updated.
- **Notes** tab: unchanged, MC reflections still go here.
- A student note that starts with `=`, `+`, `-` or `@` is now stored as plain
  text, not run as a formula.

## What the page needs from the server
- `POST {event:'lqalbum'}` answers `{"ok":true}`. Until step 4 is done the old
  server answers plain `ok`; the page then says "the album server is not
  updated yet" and keeps the save on the student's device, and sends it once
  the new version is live.
- `POST {event:'note'}` answers `ok`, or `busy` if the Sheet was locked.
- `GET ?albq=1&keys=…` returns the questions for the PDF export, only for
  keys that are in that student's own Mistakes or LQAlbum rows.
