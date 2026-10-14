# Teacher AI marking (teacher.html): deploy (BUILD 2026-10-14b)

`teacher.html` is a new page on the site for teachers only. You upload one PDF with the whole class's test, one Word marking scheme, and Gemini splits the scan by student, reads each script, and marks every question twice. Only the points the AI is unsure of come to you. The page is not linked from the student pages.

## Apps Script (one time)
`Code.gs` 2026-10-14b already contains everything from 2026-10-13b (E-points, leaderboard). If you have not pasted 2026-10-13b yet, this one does it too.

1. Sheet > Extensions > Apps Script.
2. `Code.gs`: select all, paste the new `Code.gs`, Save.
3. If you don't have them yet, add the files `EPoints` and `LongQMark` (click **+** > Script) and paste `EPoints.gs` and `LongQMark.gs`.
4. Click **+** > Script, name it `TeacherMark`, paste `TeacherMark.gs`, Save.
5. Project Settings (gear) > Script Properties > Add property:
   - `TEACHER_EMAILS` = the Google account(s) you sign in with, comma-separated.
     Nobody else can use the page: a student who signs in gets "teachers only" and nothing else.
   - `GEMINI_KEY` is the same key the students' AI already uses. Nothing new to add.
   - Optional `AI_FALLBACK` = a second Gemini model name (run `listModels` in the editor to see them). When the main model says "high demand" (503), marking switches to it.
6. Deploy > Manage deployments > pencil > Version: **New version** > Deploy. The /exec URL stays the same.
7. Open `<your /exec URL>?ping=1`: it should show build `2026-10-14b` and `"teachers_set": true`.

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

## Saving admin time (added after the first version, no Apps Script change)
- **All jobs** (first tab): every marking job with its progress, mean and status. Open several jobs as tabs; marking carries on in the background while you work in another tab (the tab's dot pulses).
- **Copy for class**: same test for another class. The confirmed scheme, your comment bank and the 3 scripts you checked (the standard) come along, so you only upload the new scan.
- **Scheme library**: each confirmed scheme is saved; pick it in step 2 next time instead of uploading the Word file again. Class lists are saved per class too.
- **Review keys**: `0`–`9` sets the mark of the highlighted point, `Enter` confirms the script, `J` / `K` next / previous. The page jumps to where the uncertain point is. **Approve N AI-sure scripts** confirms every script with nothing uncertain in one click.
- **Comment bank**: a comment you write once shows as a one-click chip on the same point for the next students.
- **Student history** (All jobs): each student's % over the last jobs of a class and the improvement tier that keeps coming back.
- **Printable answer sheet** (All jobs): boxes for class, class no. and question number, so the AI splits the scan almost perfectly.
- **Follow-up lesson** (Dashboard): students grouped by tier with the points to reteach; copy it or download a PDF.
- **Copy for mark book** (Export): marks in class-no. order, ready to paste into the school mark book.
- **Remove scan** (All jobs) frees space in the browser but keeps the marks.

## Limits worth knowing
- "High demand" (503) means Google's side is overloaded for a while, not that your limit is used up. The page waits 15–60 seconds and asks again by itself (and uses `AI_FALLBACK` first if you set it).
- Free Gemini has a per-minute and a per-day limit. The page waits and retries; if the daily limit runs out it stops and **Continue marking** picks up where it left off.
- Each script costs about 1 request per 4 pages to read, plus 2 to mark (both runs go out together).
- Handwriting the AI can't read shows as [?word?] in "What the AI read", and a mark resting on it is sent to you.
- The annotated PDF uses a Western font: comments in Chinese characters print as "?". Comments are written in English.
