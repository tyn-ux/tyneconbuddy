# Progress layer 部署指南

四頁（`index.html` · `ch11.html` · `ch22.html` · `macro.html`）而家共用一個
`game.js`，加咗：等級、技能樹、班際排行榜。前端已經行得，唔使做任何嘢；
**排行榜**先要後端。

---

## 一、先睇清楚：你而家有兩個 deployment

Patch 之前，四份檔案指住唔同地方：

| 檔案 | 原本 SYNC_URL |
|---|---|
| `index.html` | `''`（冇後端） |
| `ch11.html` | `AKfycbzwCpKJ2TQqqD-IkUo6O8WI…` ← **另一個 deployment** |
| `ch22.html` | `AKfycbwy3bPHzxQ-0Qj7c7aNdc2Q…` |
| `macro.html` | `AKfycbwy3bPHzxQ-0Qj7c7aNdc2Q…` |

一個班只可以有一個排行榜，所以四份檔案已經統一指去
`AKfycbwy3bPHzxQ-0Qj7c7aNdc2QtI36ir4UfxQDdgBQGhXbtoPzVUN5TKav11xsB8_Nhb5Z9A`
（原本 `ch22` + `macro` 用嗰個，四份入面最多人用）。

**如果你想用返 `ch11` 嗰個 deployment**，四份檔案改返同一個 URL 就得
（搜 `const SYNC_URL =`）。用邊個都得，但一定要四份一樣。

`ch11` 嗰個舊 deployment 之後就冇人再寫入，可以留住做備份。

---

## 二、換 Code.gs

1. 開你個 Apps Script project：
   <https://script.google.com/u/0/home/projects/1HPDRRCmKkGTBsPknobyrDbMOtvHNVz5hOaAGCvEqeJ4ef4JaXscHmWHn/edit>
2. **做份備份先** — 揀 `Code.gs` 全選 copy，貼落一個新檔案 `Code_backup.gs`
   （或者存落你部機）。下面第五節解釋點解要備份。
3. 開 `Code.gs`，全選刪走，貼呢個 repo 入面 `Code.gs` 全份內容。
4. 改第 26 行 `var ADMIN_PASS = 'econ2026';` — 改成你四份 HTML 入面
   `ADMIN_PASS` 嗰個值（唔一致嘅話 Admin tab 個 Class Aggregate 會讀唔到）。
5. 儲存（💾）。

## 三、行一次 `setup()`

編輯器上面個 function 下拉選單揀 **`setup`** → 撳 ▶ Run。

第一次行會彈授權：**Review permissions → 揀你個 Google 帳戶 →
Advanced → Go to (project name) → Allow**。行完會喺個 Sheet
（<https://docs.google.com/spreadsheets/d/130td46ZXxU0HaQDWOhsR49RJgw5ofxraqqfyX4sb58k/edit>）
見到三個 tab：

| Tab | 入面有咩 |
|---|---|
| `Log` | 每一次答題、登入嘅原始紀錄（同以前一樣） |
| `Scores` | **新** — 每個學生每一頁一行：uid、email、花名、清咗幾多題、每個 section 嘅 % |
| `Config` | `status` = `OPEN` / `CLOSED`、`closed_message` |

⚠️ 如果你舊 Code.gs 用緊唔同嘅 tab 名（例如 `Responses` 而唔係 `Log`），
新 code 會另開一個 `Log` tab，舊 tab 嘅舊資料會原封不動留喺度，只係唔會再有
新 row 入去。想保住原本個名，話我知你舊 tab 叫咩，我幫你改返 `Code.gs` 對應。

## 四、Redeploy（一定要用返同一個 deployment）

**Deploy → Manage deployments** → 揀返你而家嗰個 deployment →
右上角枝鉛筆 ✏️ → **Version: New version** → **Deploy**。

- 咁樣 `/exec` URL **唔會變**，四份 HTML 唔使再改。
- 如果你撳咗 **New deployment**，就會出一條新 URL，你要手動更新四份檔案。
- Execute as: **Me**；Who has access: **Anyone**。呢兩項一定要係咁，
  唔係學生（未登入 Google 或者用私人帳戶）會收到 401，排行榜永遠 loading。

## 五、驗一驗

1. 開 `index.html`，用學生帳戶 Google sign-in。
2. 去 **Drill**，答啱三四題。
3. 去 **Progress** tab → 個 ring 應該郁咗，Skill tree 有一條 bar 有色。
4. 落到 **班際排行榜** → 打個花名 → **Save** → 等一兩秒 → **↻ Refresh**。
   應該見到自己上榜。
5. 返去個 Sheet `Scores` tab，應該有一行，`nick` 欄有你打嘅花名。

排行榜讀唔到會直接寫原因喺卡入面（`timeout` / `network` / `no data`），
唔會靜靜死。學生嘅進度全部存喺自己部機，後端塞車完全唔影響做題。

---

## 計分規則（寫咗喺學生見到嘅卡上面）

1. **答啱先計。** 答錯唔會扣分，但唔會加進度。
2. **同一題答錯之後，要隔 5 題或者 10 分鐘再答啱先計入進度。**
   即撳即改答案係零收穫 — 呢條係防止「撳到啱為止」嘅刷分法。
   學生撳中之後會即刻彈一句解釋，唔係靜雞雞唔計。
3. **Section % = 該 section 清咗幾多題 ÷ 該 section 總題數。** 呢個係技能樹顯示嘅數。
4. **排名 = 全部 section 加埋嘅總完成率**，唔係每個 section 嘅 % 拉平均。
   點解：`ch11` 個 `Floor` section 得 11 題，`ch22` 個 `F-M` 有 79 題。
   如果每個 section 等權，掃三個細 section 就贏晒掃大 section 嘅人。
   按題數計就冇呢個窿。
5. 冇開過嘅一頁 = 嗰頁 0%。後端會攞全班報過嘅最大題數做分母，
   所以淨係掃一頁唔會扮到 100%。

## 等級

| Lv | 名 | 總完成率 |
|---|---|---|
| 1 | 起步 Starter | 0% |
| 2 | 打底 Foundation | 3% |
| 3 | 上手 Familiar | 8% |
| 4 | 穩陣 Steady | 15% |
| 5 | 熟手 Sharp | 25% |
| 6 | 硬淨 Strong | 40% |
| 7 | 進階 Advanced | 60% |
| 8 | 高手 Expert | 80% |
| 9 | 大師 Master | 95% |
| 10 | 滿盤 Full Marks | 100% |

四頁加埋 1,794 條 MCQ，所以 Lv.2 大約 54 題、Lv.5 大約 449 題。
想改快慢，改 `game.js` 頂部個 `LEVELS` 陣列同 `Code.gs` 個
`var LEVELS = [...]` — **兩邊要一樣**，唔係榜上顯示嘅等級會同學生自己見到嘅唔夾。

## 私隱

- 榜上淨係顯示花名，唔會顯示 email。
- 讀排行榜嗰個 JSONP request 傳嘅係 email 嘅短 hash（`uid`），
  唔係 email 本身，所以 email 唔會出現喺 URL 或者 server log。
- `Scores` tab 入面有 email，但淨係你（Sheet owner）睇到。

## 學期之間清榜

Apps Script 編輯器揀 **`resetLeaderboard`** → Run。
淨係清 `Scores`，`Log` 嘅答題歷史會保留。

---

## 檔案

| 檔案 | 做咩 |
|---|---|
| `game.js` | 全部前端邏輯（計分、等級、技能樹、排行榜 UI、CSS）。**一個地方改，四頁一齊生效。** |
| `Code.gs` | 貼落 Apps Script 嘅後端。 |
| 四份 `.html` | 每份底部加咗一段 `window.GAME_CONFIG`（話畀 `game.js` 知呢一頁啲 section 點分）同 `<script src="game.js" defer>`。原本嘅 code 冇動過。 |
