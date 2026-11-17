# What the native runner does with the buffed Nov 15 export (format 7)

From the gear sim's runner at its current clean commit, run on the archived export (saved 2026-11-15T23:59:05.000Z, format 7, level 32). The raw output is `buff-filter-nov15-format7.json`.

**It does NOT filter Warchief's Blessing.** Format 7 records only each buff's name and spell id: no `points`, no description, no source. Forever's spell data has no row for 16609 (only 355366). So:

| Buff | spell_id | source | how |
| --- | --- | --- | --- |
| Warchief's Blessing | 16609 | not recorded (format 7) | **unknown** |

**Why most lines are still safe:** the reader builds the naked attributes as the game's total − positive buff − negative buff (UnitStat), and the sim adds the gear itself. So a buff can't reach strength, agility, stamina, intellect or spirit, nor what follows from them. Health and mana have no such split from the game, so a buff in the totals would land in the calibrated base.

**The sheet lines, as the runner reports them:**

| Line | Status | Detail |
| --- | --- | --- |
| strength | checked_pass | sim 80.00 vs game 80.00 (±1) |
| agility | checked_pass | sim 75.00 vs game 75.00 (±1) |
| stamina | checked_pass | sim 128.00 vs game 128.00 (±1) |
| intellect | checked_pass | sim 88.00 vs game 88.00 (±1) |
| spirit | checked_pass | sim 87.00 vs game 87.00 (±1) |
| attackPower | checked_pass | sim 322.00 vs game 322.00 (±2) |
| dodge | checked_pass | sim 9.93 vs game 9.93 (±0.06) |
| meleeHit | checked_pass | sim 0.00 vs game 0.00 (±0.05) |
| armor | checked_pass | sim 744.00 vs game 744.00 (±5) |
| meleeCrit | checked_pass | sim 9.77 (base 1.7% less 0.04% x 7 weapon skill under the cap) vs game 9.76 (±0.06) |
| spellCrit | checked_pass | sim 7.23 vs game 7.23 (calibrated, not a check) |
| health | not_checked | not checked: unknown buff Warchief's Blessing (sim 1770 vs game 1770; base solved from this buffed sheet) |
| mana | not_checked | not checked: unknown buff Warchief's Blessing (sim 1773 vs game 1773; base solved from this buffed sheet) |
| buffs | not_checked | unknown: Warchief's Blessing |

- `checked_pass`: the sim's unbuffed sheet matches the game within the tolerance, so the unknown buff didn't move it (the five attributes, attack power, armor, dodge, hit and melee crit).
- `spellCrit` passes because it's calibrated (the game's rate answered 0), not checked.
- `not_checked`: non-blocking. The run goes on and the file's checks say so. A line that FAILS while an unknown buff is up becomes `not_checked` rather than a failure. A line that fails with no unknown buff still blocks.
- `buffs`: lists each buff and what was done; it fails (non-blocking) whenever one is unknown.

**Calibration:** mode `solved_from_buffed_sheet`. No clean calibration at level 32 exists yet, so base health (670) and base mana (733) were solved from this buffed sheet and marked. Base health likely includes the buff's health. With a clean calibration on record for the same level, race and class, the runner would use that instead and not re-solve.

**The unbuffed sheet (what the results file shows):** strength 80, agility 75, stamina 128, intellect 88, spirit 87, attack power 322, armor 744, health 1770 (includes the unfiltered buff, see above), mana 1773, melee crit 9.77%, spell crit 7.23%, dodge 9.93%, hit 0%.

**What a format 8 export changes:** each buff carries the aura's `points`, the spell's description and source (self / other / none). The runner then classifies Warchief's Blessing as `game_numbers` (health +300 into the sheet sim; haste and mp5 as notes), checks health and mana, and records a clean calibration. A format 8 description number that isn't among the points keeps the buff `unknown`.

**For the browser gate:** match this rule, not "always filtered". Format 7 + an unmodelled buff → `unknown` → those lines are `not_checked` (non-blocking), and calibration follows the rule above.
