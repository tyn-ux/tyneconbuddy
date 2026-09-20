# EconMon 經濟獸 — HKDSE Economics RPG

A FireRed-style pixel RPG where every EconMon is one HKDSE Economics concept. Students catch EconMon by answering questions (bilingual EN / 繁中), level them up, evolve them, and challenge gym bosses. Current version: Tai O region (Textbook Ch.1–2).

- Play: open `index.html` (GitHub Pages).
- Class mode: set `window.ECONMON_API` near the top of `index.html` to your Google Apps Script Web app URL (see GUIDE.md). Leave it empty for offline mode.
- Question bank: `questions.csv`. The game loads this file when it is served from the web; if the file is missing, it uses the copy embedded in `index.html`.

## questions.csv columns
| column | meaning |
|---|---|
| id | unique question id, e.g. `oppcostra-03`, `oppcostra-S2` (scenario), `flowray-D1` (diagram) |
| econmon | EconMon id; `boss_fubak` / `boss_hoitse` = gym boss steps; `hard_…` = DSE hard mode |
| type | `tf`, `mc`, `fill`, `sort`, `order`, `dse`, `diag` |
| tag | `scen` scenario · `dse` · `diag` |
| diagram | for `diag`: `circular_flow` or `demand_supply` |
| prompt_en / prompt_zh | question text. For fill-in: `____` for each blank in EN, ①② markers in ZH |
| options_en / options_zh | choices separated by `\|` (MC 4 options; fill word bank; sort/diag bins; dse statements) |
| items_en / items_zh | cards for sort / order / diag, separated by `\|` (order: in the correct order) |
| answer | tf `T`/`F`; mc `A`–`D`; fill: EN words `\|`; sort/diag: bin number per item `1\|2\|1`; dse: correct statement numbers `1\|3\|4`; demand_supply: `D:1;S:0` (1 = right, -1 = left) |
| hint_en / hint_zh, explain_en / explain_zh | hint (costs HP) and explanation |

## dialogue.csv
Every fixed line the characters say. Columns: id, where, original, text. Write your own version in `text` (leave blank to keep the original). In class mode the Dialogue sheet does the same (see GUIDE.md §F).

Keep every field on one line and do not use `|` inside a text.
