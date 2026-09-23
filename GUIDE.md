# EconMon 上 GitHub + 班級模式（Google Apps Script）設定指南

整個過程大約 20 分鐘，分三部分：
- A. 將遊戲放上 GitHub Pages，學生用網址就可以玩。
- B. 用 Google Sheet 加 Apps Script（Code.gs）做 backend，記錄學生進度。
- C. 將兩者連接，再學識日常管理（封鎖學生、重設 PIN、睇答啱率）。

你個 folder 入面有：
- `github/`：index.html、questions.csv、dialogue.csv、mons.csv、README.md，擺上 GitHub
- `apps-script/Code.gs`：貼去 Apps Script
- `GUIDE.md`：就係呢份指南

---

## A. 放上 GitHub Pages

1. 登入 github.com，右上角 **＋ → New repository**。
   - Repository name：例如 `econmon`
   - 揀 **Public**。GitHub Pages 免費版需要 public。
   - 撳 **Create repository**。
2. 喺新 repo 頁面撳 **uploading an existing file**。
3. 將 `github/` 入面五個檔案拖入去：`index.html`、`questions.csv`、`dialogue.csv`、`mons.csv`、`README.md`。
4. 撳 **Commit changes**。
5. 去 **Settings → Pages**：
   - Source 揀 **Deploy from a branch**
   - Branch 揀 **main**，folder 揀 **/(root)**
   - 撳 **Save**
6. 等 1–2 分鐘，Pages 頁面頂會顯示網址，例如 `https://tyn-ux.github.io/econmon/`。
7. 打開個網址試玩。未做 B 部分之前，遊戲會用單機模式，唔使登入。

> 之後改題目：直接喺 GitHub 打開 `questions.csv` → ✏️ Edit → Commit。遊戲下次載入就會用新題庫。
> 改完記得保持欄位格式，見 README.md。

---

## B. 建立 Google Sheet + Apps Script backend

1. 去 sheets.google.com 開一個新 Spreadsheet，改名做「EconMon 班級紀錄」。
2. 選單 **Extensions → Apps Script**。
3. 刪走預設嘅 `function myFunction(){}`，將 `apps-script/Code.gs` 全部內容貼入去，撳 💾 儲存。
4. 喺上面 function 下拉選單揀 **setupSheets** → 撳 **Run**。
   - 第一次會問權限：Review permissions → 揀你個 Google 帳戶 → Advanced → Go to (unsafe) → Allow。呢個係你自己寫嘅 script，所以 Google 會咁提示。
   - 返去 Sheet，會見到三個工作表：**Students**、**Answers**、**Blacklist**。
5. 右上角 **Deploy → New deployment**：
   - ⚙️ Select type → **Web app**
   - Description：`EconMon v1`
   - Execute as：**Me**
   - Who has access：**Anyone**。要揀 Anyone，學生先唔使 Google 帳戶都可以連接。
   - 撳 **Deploy**，再 **Copy** 個 **Web app URL**（`https://script.google.com/macros/s/……/exec`）。
6. 測試：將 URL 貼入瀏覽器。見到 `{"ok":true,"app":"EconMon",...}` 就代表成功。

---

## C. 連接遊戲同 backend

1. 喺 GitHub repo 打開 `index.html` → ✏️ Edit。
2. 第 9 行左右搵到：
   ```js
   window.ECONMON_API = '';
   ```
   將 Web app URL 貼喺兩個 `'` 中間：
   ```js
   window.ECONMON_API = 'https://script.google.com/macros/s/xxxx/exec';
   ```
3. **Commit changes**，等 1 分鐘，重新打開遊戲網址。
4. 而家遊戲會先顯示登入畫面。學生要輸入：
   - 姓名
   - 班別（例如 4A）
   - 學號
   - 花名（排行榜只顯示花名）
   - 4 位數字 PIN（第一次登入時設定，之後要用同一個 PIN）
5. 進度大約每 15 秒同步一次。學生切走 app 或者撳「立即同步」都會同步。
6. 每次同步都會連埋遊戲存檔一齊上傳。所以學生換部機、用同一組資料登入，就可以繼續玩。

### 學生玩嘅時候，Sheet 會記錄
- **Students**：每人一行，有 key（班別-學號）、捉咗幾多隻、進化數、最高 Lv、徽章、困難模式、成就數、稱號、答啱題數、題庫完成 %、最後登入時間、雲端存檔。
- **Answers**：每答一題一行，記錄時間、學生、題目 id、EconMon、題型、啱／錯、超時、用咗幾多秒。

---

### v0.13 新增：PvP 對戰（排位）
- 學生喺 START → 對戰 PvP 可以揀全班其他玩家挑戰。Sheet 會自動多兩張工作表：**PvP**（每人嘅 rating、勝負、夥伴 EconMon、答題準確度）同 **PvPLog**（每場排位戰）。
- Rating 由 1000 起跳，用 Elo 計（挑戰者 K = 32，被挑戰者唔喺線，變動減半）。封鎖名單上嘅學生唔會出現喺對手名單。
- 要用排位，Apps Script 要貼新版 Code.gs 並 **Deploy › Manage deployments › Edit › Version: New version**（見 E 部分）。未更新之前，學生只會見到練習對手（虛構）。
- 同機對戰（兩個同學用同一部機輪流答題）唔使 backend，唔計排名。

## D. 日常管理（Sheet 頂會多咗一個 **EconMon** 選單）

| 想做 | 點做 |
|---|---|
| 封鎖學生 | 喺 **Students** 揀嗰個學生嘅行 → EconMon ▸ **Block selected student**。或者直接喺 **Blacklist** 加一行。 |
| 解除封鎖 | 喺 **Blacklist** 刪走嗰一行 |
| 封鎖整班 | Blacklist 只填 class（例如 4C），classNo 同 name 留空 |
| 學生忘記 PIN | 喺 Students 揀佢嘅行 → EconMon ▸ **Reset PIN**。佢下次登入時輸入嘅 PIN 就會成為新 PIN。 |
| 睇邊題最多人錯 | EconMon ▸ **Update question stats**。**QuestionStats** 工作表會列出每題嘅嘗試次數、答啱率、超時同平均用時，最低答啱率排最前。 |
| 學生打錯名／同學號撞咗 | 喺 Students 直接改 name 或者刪走嗰行。刪咗之後學生可以重新登記。 |

封鎖咗嘅學生會發生咩事：登入時會見到「帳戶已被老師暫停」。如果佢已經喺遊戲入面，下一次同步時就會被鎖住。

---

## E. 更新 Code.gs（例如之後我改咗 backend）

1. Apps Script 貼上新 Code.gs → 儲存。
2. **Deploy → Manage deployments** → 揀現有 deployment → ✏️ → Version 揀 **New version** → **Deploy**。

咁做**網址唔會變**，唔使改 index.html。
注意：唔好揀「New deployment」，因為咁會出一個新網址。

---

## F. 直接改題目同對白（唔使改 code）

> **v0.13 注意：** EconMon 嘅能力值重新平衡咗（見 STATS.md）。如果你之前匯入過 **Mons** 工作表，嗰度嘅舊數值會蓋過新平衡。想用新數值：刪除 Mons 工作表入面 atk、def、hp 三欄嘅內容（或者成張表），再用 EconMon ▸ Import game content 重新匯入。

1. 更新 Code.gs 之後（見 E），返 Sheet 撳 **EconMon ▸ Import game content 匯入題目同對白**，貼上你嘅遊戲網址（例如 `https://tyn-ux.github.io/econmon/`）。
2. Sheet 會多咗三個工作表：
   - **Questions**：成個題庫，欄位同 questions.csv 一樣。直接改 cell（題目、選項、答案、提示、解釋）就得。
   - **Dialogue**：所有角色對白。`original` 係原句，喺 **text** 欄寫你嘅版本；留空 = 用原句。
   - **Mons**：每隻 EconMon 一行（id、name、chapter、tier、atk、def、hp）。改 **tier**（basic／rare／epic／legendary，有下拉選單）或者 **atk／def／hp**（1–100）就可以調整稀有度同能力。id、name、chapter 只係參考，唔好改 id。
3. 學生重新載入遊戲就會用你嘅版本。想還原：刪走 Questions 工作表（或者清空 text 欄）。
4. 注意：用 `|` 分隔選項；答案格式見 README.md。有數字嘅動態句子（例如「你捉咗 3 隻」）暫時未改得。
5. 冇用班級模式？可以直接喺 GitHub 改 `questions.csv`、`dialogue.csv` 同 `mons.csv`。
6. 改稀有度會影響捕捉難度（要答啱幾多題）同遇到機率；已捉到嘅 EconMon 會即刻用新 stat。

## G. 遊戲入面嘅獎勵系統（同學生講解用）

- 💰 金錢：答啱題、捉 EconMon、升級（Lv×$30）、進化（$300）、打贏對戰玩家同館主、隱藏寶物、每日登入。
- 🛒 小販：買粥同道具，亦有 11 套服裝（$250–$2,600）。
- 🏅 稱號：每個地區一個（大澳「棚屋水鄉人」、深水埗「布行車衣匠」），加上成就稱號同模擬試場嘅「經濟學徒」。
- ⚔ 能力值：ATK 高＝快答有機會暴擊；DEF 高＝有機會擋住傷害；夥伴同野生 EconMon 同章有 +20% 傷害。想學生練 EconMon，可以叫佢哋留意呢三樣。

## H. 常見問題

- **學生用唔到／一直顯示「連唔到伺服器」**：
  - 檢查 Who has access 係咪 **Anyone**。
  - 檢查 URL 係咪以 `/exec` 結尾（唔係 `/dev`）。
- **想學生唔使登入**：將 `window.ECONMON_API` 改返 `''`。
- **私隱**：排行榜只顯示花名。真實姓名、班別只喺你嘅 Sheet 入面。
  - 個 Sheet 唔好 share 俾學生。
  - Apps Script 用你嘅帳戶寫入，學生睇唔到個 Sheet。
- **PIN 安全性**：Sheet 只儲存 PIN 嘅 SHA-256 hash，唔會儲存原本嘅數字。呢個係課堂用嘅基本防護，唔係銀行級保安。
- **同 tyneconbuddy 嘅分別**：tyneconbuddy 用 Google 登入。EconMon 用姓名＋班別＋學號＋PIN，所以冇 Google 帳戶都玩到。如果你想兩個網站統一用 Google 登入，可以將 tyneconbuddy 個 Code.gs send 俾我，我再改。
