# Add a paper (upload a whole paper into the question bank): deploy

paper.html gets a 5th section, **Add a paper**. The Sheet gets one new menu item, **tyneconbuddy → Add a paper from the paper builder…**, from the new file `PaperImport.gs`.

This folder already contains the class-list gate (PR #47) and the pets / collection store (PR #48). Merge **#47, then #48, then this PR**, then paste this folder once.

## 1. Paste (replace ALL files from this same folder)
In the Apps Script editor, replace every file with the copy from this folder:
`Code.gs`, `EPoints.gs`, `LongQMark.gs`, `TeacherMark.gs`, `Access.gs`, and add **`PaperImport.gs`** (＋ → Script → `PaperImport`).
Do not mix with older copies. Do NOT run install().

## 2. Deploy
Deploy → Manage deployments → pencil → Version: New version → Deploy (same deployment).
`SYNC_URL?ping=1` should show build `2026-11-17b` (this PR does not change Code.gs).

## 3. Use it
1. paper.html → Bank & AI: load the bank (needed so nothing is added twice) and save your Gemini key.
2. Add a paper: choose exam, year, paper; upload the question paper PDF and the answer key / marking scheme PDF (or type the MC answers). Press **Read the paper**.
3. Check every question. Gemini's own MC answers (no key) must be ticked "I checked this answer". Questions already in the bank are left unticked.
4. **Download for the Sheet**, then in the Sheet run **tyneconbuddy → Add a paper from the paper builder…** and choose the file.
5. Export the question bank again to see the new questions in paper.html.
