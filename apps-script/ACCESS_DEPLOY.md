# Class list (Roster) gate + access log — deploy (BUILD 2026-11-17b)

What it does: when the class list is ON, only Google accounts in the **Roster** tab
can use the site. Every sign-in (and every refused one) is written to the
**Access log** tab with email and time. Teachers in Script Property
`TEACHER_EMAILS` always get in. recite.html and learning.html now also need a
live sign-in (gate.js).

## Paste (replace ALL files, from this same folder)
In the Apps Script editor, replace every file with the copy from this folder:
`Code.gs`, `EPoints.gs`, `LongQMark.gs`, `TeacherMark.gs`, and add the new file
`Access.gs` (＋ → Script → name it `Access`). Do not mix with older copies.
Do NOT run install().

## Deploy
Deploy → Manage deployments → pencil → Version: New version → Deploy.
Keep the same deployment. Open `SYNC_URL?ping=1`: build should say `2026-11-17b`
and `class_list_only` should be `false` for now.

## Fill the class list (in the Sheet, reload it first to see the menu)
1. tyneconbuddy → **Copy signed-up students into the class list** (copies everyone
   who already picked a seat). Check the Roster tab: any email you don't know,
   set `active` to `no` or delete the row.
2. tyneconbuddy → **Add students to the class list…** for anyone missing
   (one email per line, optional name after a comma).
3. Make sure your own account is in Script Property `TEACHER_EMAILS`.
4. tyneconbuddy → **Turn the class list on / off** → Yes. `?ping=1` now shows
   `class_list_only: true`.

## Day to day
- Remove a student: delete their Roster row or set `active` = `no`. They are out
  within a minute.
- Who used the site: **Access log** tab (`sign-in`, `refused:roster`, …). The
  **Log** tab still has every answer/event with email.
- Undo everything: menu → Turn the class list on / off → Yes (turns it off).
