# EconMon 經濟獸 — Roster audit & design advice (v0.23)

Source: the 111 EconMon in `META.mons` + `spells_v2`, measured in the running game. Numbers below are counted/computed, not estimated. Anything I could not verify is marked **[待查證]**.

## A. What the data says

| Item | Result |
|---|---|
| Roster | 111 EconMon, Ch.1–20 (Ch.1–2 have 10 each, Ch.5 has 6, the rest 5) |
| Tier | Basic 40 · Rare 40 · Epic 20 · Legendary 11 |
| Stat total (ATK+DEF+HP) | Basic 164–187 · Rare 200–221 · Epic 235–256 · Legendary 270–291 — tidy, no overlap between tiers |
| Archetype | Striker 28 · Balanced 21 · Guardian 19 · Bruiser 18 · Stamina 16 · Glass 9 |
| Questions per EconMon | 17–20 each (consistent) |
| Missing definition / location / spell | none |

## B. Improvement points (most important first)

1. **ATK / DEF barely change how fast you win.** Wild damage is clamped per tier, so hits-to-KO is set by tier, not by stats. Measured with three different leads: Basic needs 3–4 SPELLs, Rare 4–5, Epic 5–6, Legendary 5–7. A lead with ATK 56 needs 4 hits on a Basic; ATK 76 and ATK 100 both need 3. → Above ~70 ATK there is no benefit, and wild DEF is almost irrelevant. *Suggestion:* widen the clamp (e.g. ±25% instead of a hard hits-per-tier band) so ATK/DEF visibly matter, or keep the clamp but say so (Party tab now says this).
2. **Stat ceiling wastes level-ups.** 20 EconMon have ATK 100, 7 have DEF 100, 8 have HP 100; `statOf` caps at 100, so their level-up growth adds nothing. *Suggestion:* lower the base of the 100s (e.g. 92–96) so levelling still feels good, or raise the cap to 120 for Prime (evolved) forms.
3. **Four pairs share the exact same stat block** (and the same archetype, so the same move effects): Wantlet = Normafly (76/40/50), Scarcroaker = Commandra (48/92/60), Oppcostra = Marketail (56/56/88), Fullcrab = Queuepus (68/66/66). *Suggestion:* shift each pair by ±2–4 points, or give one of each pair a different archetype.
4. **ULTIMATE is worse than SPELL per 💡 on raw damage.** SPELL deals ×0.85–1.25 per 1💡; ULTIMATE deals ×1.8–3.0 for 3💡 (×0.60–1.00 per 💡), plus a typing step and a 2-turn cooldown. It only wins on tempo (fewer enemy turns) and side effects (heal/shield). Now that the damage numbers are on the buttons players will notice. *Suggestion:* raise ULT multipliers by ~35% (Striker 2.6→3.5, Balanced 2.3→3.1 …) or cut the cost to 2💡.
5. **13 animal prototypes are reused** (3 geckos: Factorgeck, Stretchgecko, Ginigecko; 2 each for 寄居蟹, 小白鷺, 中華白海豚, 綠海龜, 黑尾鷗, 八哥, 巴西龜, 白鴿, 錦鯉, 唐狗, 蜜蜂, 麻鷹). Students will mix them up. *Suggestion:* give each repeat a fixed accessory/colour tied to its concept (e.g. the elasticity gecko carries a rubber band).
6. **Some names are hard to say or read:** Mrmcmoth, Egnigret, Relprifox, Alongsnail, Sumcaterpillar (14 letters), Twinshrike. *Suggestion:* add a pronunciation/“say it” line in the Econ-dex, or rename to one pronounceable word.
7. **Concept text is too long for cards.** The `concept` field runs up to ~100 characters (e.g. “advantages, disadvantages and limits of division of labour”). *Suggestion:* add a `short` label (≤25 chars, e.g. “Division of labour 分工”) for cards, and keep the long text for the Econ-dex.
8. **Definitions mix two jobs.** Lengths run 33–222 characters; Levycicada, Welfarefly and Twinshrike are formula/list dumps (Twinshrike and Levycicada have no English term in the sentence). *Suggestion:* two layers — a one-line “Say it simply” (≤40 chars) shown first, the full note behind a “More” tap.
9. **Spell names follow archetype more than concept** (move names end in 擊 ×51, 流 ×26, 守 ×19, 湧 ×15). Names like “Scarcity Guard” don't tell a student what the concept is. *Suggestion:* when a move is cast, show one line of the concept under the move name (“Scarcity = unlimited wants, limited resources”) — every cast becomes a mini-lesson.
10. **Pacing:** Ch.2 already has two Legendary (Deedtle, Flowray) and Ch.1 has two Epics, while Ch.20 has one Legendary. Average stat total rises only from ~197 (Ch.1) to ~228 (Ch.20). *Suggestion:* decide on purpose — either make early Legendaries “guardians” you meet but can't catch until a badge, or move them later. [design choice]

## C. Things I could not verify
- Whether the chapter numbers/ordering match the DSE syllabus or your own scheme — **[待查證]** by you.
- Whether each species really lives at its assigned HK location (e.g. 綠海龜 at 大澳碼頭, 中華鱟 at 鹽田) — **[待查證]**; treat as decoration, not as exam content, until checked.

## D. Game-developer advice (Pokémon-style)

**Teach one mechanic at a time.** The new/unfamiliar loop is Charge → 💡 → Spell/Ultimate. Pokémon never shows the whole system at once. Suggested first battle: only CHARGE and SPELL are enabled (others greyed with “unlocks later”), ULTIMATE appears on the first badge, SWAP after the first faint.

**Show the number before the choice.** Done in v0.23 for SPELL/ULTIMATE (button + gold/red marks on the enemy HP bar). Next: show the enemy's incoming damage on its intent badge (“⚔ 17”), so Charge-vs-Spell becomes an informed decision.

**Type-chart equivalent = concept links.** Pokémon's depth comes from relationships. EconMon already has “same chapter +20%”. Add 1–2 hand-picked relations per concept (supply ↔ demand, price ceiling ↔ black market) and give “Effective!” when the player's EconMon is linked to the foe. This is also revision: students learn which concepts connect.

**Make a wrong answer useful.** After a miss, show the model reason in one line and tag the question for the spaced Review (“💤 要溫習”) — the loop already exists; surface it in the battle.

**Dex that rewards looking.** Add a “Seen” state (silhouette → name → full), per-chapter completion stars, and a filter by chapter/zone. “Catch them all” per chapter is a natural unit for a 40-minute lesson.

**Heal point + item-in-battle.** A fixed heal station per district (Pokémon Center) and using a potion as a battle command give the coin economy a real purpose beyond cosmetics.

**Session length.** Design for the 10-minute mobile session: a clear “next goal” line on the world map (“2 more correct answers to Lv.3”).

## E. Making it easier to read and understand (player view)

1. **Consistent colour meaning:** gold = SPELL, red = ULTIMATE, green = heal, blue = shield, everywhere (buttons, bars, logs).
2. **Numbers first, words second** in battle text: “−17 HP · 同章 +20%” beats a sentence.
3. **Max two short lines per dialogue page** in battle; move the rule text to the Party tab “How stats work”.
4. **Glossary tap:** tap an exam term (e.g. *price elasticity of demand*) in any question to see the one-line definition — terms stay in English as required.
5. **Compact bilingual option:** on phones in landscape, show English term + short Chinese (「SPELL 法術」) instead of full double lines; the smallest landscape size (667×375) still truncates CHARGE/ULTIMATE.
6. **Tap targets ≥ 44 px and body text ≥ 12 px** on the smallest supported screen; the narrow-landscape battle buttons are currently below that.
7. **One progress line** at the top of each menu tab (like the new Party summary): where am I, what's next.
