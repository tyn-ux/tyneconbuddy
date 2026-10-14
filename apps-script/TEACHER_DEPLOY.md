# Teacher AI marking (teacher.html): deploy (BUILD 2026-10-14a)

`teacher.html` is a new page on the site for teachers only. You upload one PDF with the whole class's test, one Word marking scheme, and Gemini splits the scan by student, reads each script, and marks every question twice. Only the points the AI is unsure of come to you. The page is not linked from the student pages.

## Apps Script (one time)
`Code.gs` 2026-10-14a already contains everything from 2026-10-13b (E-points, leaderboard). If you have not pasted 2026-10-13b yet, this one does it too.

1. Sheet > Extensions > Apps Script.
2. `Code.gs`: select all, paste the new `Code.gs`, Save.
3. If you don't have them yet, add the files `EPoints` and `LongQMark` (click **+** > Script) and paste `EPoints.gs` and `LongQMark.gs`.
4. Click **+** > Script, name it `TeacherMark`, paste `TeacherMark.gs`, Save.
5. Project Settings (gear) > Script Properties > Add property:
   - `TEACHER_EMAILS` = the Google account(s) you sign in with, comma-separated.
     Nobody else can use the page: a student who signs in gets "teachers only" and nothing else.
   - `GEMINI_KEY` is the same key the students' AI already uses. Nothing new to add.
6. Deploy > Manage deployments > pencil > Version: **New version** > Deploy. The /exec URL stays the same.
7. Open `<your /exec URL>?ping=1`: it should show build `2026-10-14a` and `"teachers_set": true`.

Do **not** run `install()`.

If you have not done the E-point steps from 2026-10-13b: Sheet > reload > tyneconbuddy > **Set up E-point tabs**, then **Show every student in a class…** with `LKSCEC`.

## Using it
Open `https://<your GitHub Pages site>/teacher.html` and sign in.

1. **Upload scan**: one PDF, every student's whole test. Drag a box over the name on page 1 (it is blacked out before anything goes to Gemini, because a free key may let Google use what it receives). Press **Find students**, fix any amber row (pages, class no.).
2. **Marking scheme**: choose the Word file. Gemini splits it into questions and points from your scheme only, and drafts a rationale and accept / reject examples. Check them, press **Confirm scheme**.
3. **Mark**: Step A marks 3 scripts. Check them in Review and press Confirm: your marks become the standard. Step B marks the rest using those 3 as examples.
4. **Review**: "Need you" lists only scripts with uncertain points (the two AI runs disagree, no quote from the script, unclear handwriting, or the AI is not sure). Pick the mark, edit any comment or improvement tier.
5. **Dashboard**: class mean, by question, most-missed points, the 3 tiers with class numbers.
6. **Export**: annotated class PDF (or one per student, zipped), Excel, and **Save to Google Sheet** (tab "LQ Marking", one row per student per question).

The job is kept in that browser (close the tab and come back later). Use the same computer and browser to continue a job.

## Limits worth knowing
- Free Gemini has a per-minute and a per-day limit. The page waits and retries; if the daily limit runs out it stops and **Continue marking** picks up where it left off.
- Each script costs about 1 request per 4 pages to read, plus 2 to mark (both runs go out together).
- Handwriting the AI can't read shows as [?word?] in "What the AI read", and a mark resting on it is sent to you.
- The annotated PDF uses a Western font: comments in Chinese characters print as "?". Comments are written in English.
