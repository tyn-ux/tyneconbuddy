# EconMon 經濟獸 — HKDSE Economics RPG

A FireRed-style pixel RPG where every EconMon is one HKDSE Economics concept. Students catch EconMon by answering questions (bilingual EN / 繁中), level them up, evolve them, and challenge gym bosses. The player is 衫哥 (Sam Gor), 福伯's grandson, who loves Economics and new clothes. The screen fills the device automatically, with a 4:3 layout for iPads held sideways. Current version (v0.11): Tai O (Ch.1–2), Sham Shui Po (Ch.3–5), the Ch.1–5 mock exam hall, Kwun Tong (Ch.6–7), Mong Kok (Ch.8–10) and the Ch.6–10 mock exam hall.

- Play: open `index.html` (GitHub Pages).
- Class mode: set `window.ECONMON_API` near the top of `index.html` to your Google Apps Script Web app URL (see GUIDE.md). Leave it empty for offline mode.
- Question bank: `questions.csv`. The game loads this file when it is served from the web; if the file is missing, it uses the copy embedded in `index.html`.

## questions.csv columns
| column | meaning |
|---|---|
| id | unique question id, e.g. `oppcostra-03`, `oppcostra-S2` (scenario), `flowray-D1` (diagram) |
| econmon | EconMon id; `boss_…` = gym boss steps; `hard_…` = DSE hard mode; `pp1` / `hard_pp1` = mock exam paper (id encodes the chapter: `pp1-3-07`) |
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

## mons.csv
Stats and rarity of every EconMon. Columns: id, name, chapter, tier, atk, def, hp. Change `tier` (`basic` / `rare` / `epic` / `legendary`) or `atk` / `def` / `hp` (1–100) to rebalance an EconMon; do not change `id`. Blank or invalid cells keep the built-in value. In class mode the Mons sheet does the same (see GUIDE.md §F).

Keep every field on one line and do not use `|` inside a text.
