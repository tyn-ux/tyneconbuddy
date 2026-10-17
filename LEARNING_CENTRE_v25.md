# Learning Centre (v0.25)

Each district has a Learning Centre (學習中心), a cream building with a teal roof and a 「學」 sign. Inside, 鄧 Sir (Mr. Tang) runs one learning journey per chapter: 20 chapters, 104 stops in total. A journey assumes almost no prior knowledge. A beginner takes about 10–14 minutes per chapter; a student who already knows the material can use the fast track.

## How a stop works
1. 🎬 Hook: one or two lines set in a real place and period.
2. 🤔 你覺得呢？: guess first; a wrong guess has no penalty. If the guess is right, the student may take ⏩ the fast track straight to the Check.
3. 📖 Key idea: the exam definition (English term kept) plus 1–4 short points.
4. 🔍 Example: 3–4 numbered steps, revealed one at a time.
5. ✅ Check: one new MC question. A wrong answer is saved to the 📒 correction album; a first-try right answer gives +1 XP to that stop's EconMon if caught.
6. 🗣 Say it: pick the best of three explanations; the two wrong ones are common misconceptions.

The finale: tap cards to build the chapter chain, answer a 3-question exit ticket, write 1–2 sentences in your own words and tick a 3-point checklist. Finishing every stop and the finale gives 💰$150 and a 📘 mark on the chapter (Awards → Chapter mastery).

## Required before each gym
- On arrival in a new district, the first message and the goal line send the student to the Learning Centre.
- 鄧 Sir repeats it; each gym leader refuses a challenge until the journeys for that gym's chapters are finished.
- Students who already hold a gym's badge are not blocked.

| District | Centre (door tile) | Chapters |
|---|---|---|
| 大澳 Tai O | (17,3) next to home | 1, 2 |
| 深水埗 Sham Shui Po | (27,19) | 3, 4, 5 |
| 觀塘 Kwun Tong | (12,10) | 6, 7 |
| 旺角 Mong Kok | (13,19) | 8, 9, 10 |
| 油麻地 Yau Ma Tei | (35,20) | 11, 12 |
| 石硤尾 Shek Kip Mei | (8,17) | 13, 14, 15 |
| 紅磡 Hung Hom | (12,5) | 16, 17 |
| 中環 Central | (38,21) | 18, 19, 20 |

## Content sources
- Ch.1 follows the teacher's own Ch.1 notes (`Ch1tynl.html`). Ch.2–20 are drafted from the game's EconMon definitions.
- One fictional student, 阿瑩 Ah Ying (a Tai O S4 student in 2026), is used across chapters. All her figures and the figures for other fictional firms are labelled (Fictional) / （虛構）.
- Facts used in hooks and their sources:
  - 1963 water rationing: 4 hours every four days from 1 June 1963. Industrial History of Hong Kong, “The 1963 Water Drought”.
  - Tai O salt: imported salt competition after about 1955; closures 1955 to mid-1960s; salt pans used sluices. Industrial History of Hong Kong, Tai O salt production.
  - Tai O shrimp paste. Industrial History of Hong Kong, Sing Lee Shrimp Sauce and Paste Factory.
  - Garment factories clustered in Sham Shui Po and Cheung Sha Wan; 1970s–80s golden age. Hong Kong Memory, “Garment Industry”.
  - Relocation to the Pearl River Delta peaked in the late 1980s to early 1990s, with low-skilled workers laid off. Hong Kong Memory, “Garment Industry”.
  - Statutory minimum wage of $28 an hour from 1 May 2011. GovHK press release, 10 Nov 2010.
  - Textile export quotas to markets such as the US and EU, transferable between traders; the quota system ended in 2005. LegCo paper (1998–99); HKPC press release (23 Aug 2005).
  - Plastic bag charge of at least $1 from 31 Dec 2022. EPD, Enhanced Plastic Shopping Bag Charging Scheme.
  - 2016 Gini coefficient: 0.539 on original household income (0.537 in 2011); 0.473 after taxes and social transfers. GovHK press release, 9 Jun 2017.
  - The Airport Authority is a statutory body wholly owned by the government. AAHK website.
- General present-day statements, not source-checked: Water Supplies Department as sole water supplier; public flats allocated by waiting list; Home Ownership Scheme flats sold by ballot; free newspapers at MTR exits in the 2010s; tobacco duty on cigarettes; LCSD sports-centre fees.
- Self-checked, not an independent review.

## Teacher items still open
- Ch.4 labour productivity is defined per working hour (game definition).
- Ch.6 partnership says “generally 2–20 partners” (game definition).

## Editing
`learning_centre.json` holds every journey (chapter → stops → hook, guess, idea, example, check, say, finale). The game embeds a copy, so a change to this file needs a rebuild of `index.html`.
