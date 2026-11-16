The runner files to port, updated, from the gear sim's clean commit `62129e9` (`62129e9c26db0ce562ab48c19cff7a6f96235153`). They replace the earlier ones (from `3e228fb`). The files are whole and verbatim, split into 4 parts to stay under the comment limit; then the reference fixture.

| File | Part | Since the first version |
| --- | --- | --- |
| `local/sim/lib.ts` | 1 | CHANGED: `scenariosFor(level)` (the standard fights relative to his level) and `estimateArmor` moved here; `timelineBucketMs` request option and the `timeline` on metrics; weapon skills limited to names the sim knows; the strict request check. |
| `local/sim/buffs.ts` | 1 | NEW: the buff filter. Each buff is modelled (the sim's spell row, or Kings), game_numbers (the aura's points confirmed by the spell's description: health, mana, AP, armor and attributes into the sheet sim; haste and mp5 as notes), no_stats, or unknown. The port reads `build/buffs.json` where `exportBuffs` reads `spells_auto_gen.go`. |
| `local/sim/checks.ts` | 3 | CHANGED: `sheetFor` uses the buff filter; the unknown-buff rule (a line that still matches passes; one that doesn't is "not checked", non-blocking; health and mana "not checked"); calibration never re-solved from a sheet with an unknown buff when a clean calibration exists for the level (else solved and marked). `calibrate` belongs to #77. |
| `local/sim/session.ts` | 1 | CHANGED: each pull keeps its mana at start and end and its tto (for `pulls` and the chain's `out_of_mana_s`). |
| `local/sim/weights.ts` | 1 | Unchanged: the stat weights method and Pawn strings. |
| `local/sim/meter.ts` | 1 | Unchanged: `simShares` for the damage split (needs `lineOf`, excerpted). |
| `local/sim/gear.ts` | 2 | Unchanged: item data, sources, data flag, EP scoring, armor lists and simmed two-handers. |
| `local/armory/emit.ts` | 2 | CHANGED: fights from `scenariosFor` (the chain at his level) and the "fight levels" check; non-blocking checks don't stop the run; the sheet shown is unbuffed when a buff touching the sheet was up, with a "sheet shown unbuffed" check; single fights simmed with `timelineBucketMs: 1000`; the "real fights" note no longer quotes old numbers. |
| `local/armory/results.ts` | 3 | CHANGED: `timeline` on single fights from the sim's series ({ t_s, dps, mana int }); the imbue from the main hand's tooltip; `left_out_items` and the unconfirmed-item rule. |
| `local/score/timeline.ts` | 3 | NEW (for the "you" line, #84): a real fight per second (his damage, mana from the log). Not part of the results file yet. |
| `local/sim/request.test.ts` | 4 | Unchanged tests: no WeaponSkillUnarmed; a dropped name fails loudly. |
| `local/sim/buffs.test.ts` | 4 | NEW tests: Kings + Mark of the Wild + Warchief's Blessing; the description parser; the unknown-buff rule and calibration. |
| `local/armory/results.test.ts` | 4 | CHANGED tests: plus the timeline mapping and the imbue on the real shape. |
| `testchar-l30.json` | fixture | Regenerated at the relative levels (solo vs 30, dungeon 30 s vs 31, 2 min vs 32; was 31, 32, 33): worn DPS 107.80 / 113.04 / 84.55 (was 103.09 / 108.30 / 73.22). Lower mobs: fewer misses, less glancing, less armor. The 2-minute fight moves most because mana and spell misses bite harder at +3. |

**Notes for the port:** as before (gate tolerance 1e-9 in the browser, neutral wording for the three notes, `build/buffs.json`, profile per call), plus:
- The buff filter reads `points` and `description` from a format 8 export. A format 7 export has neither, so every unmodelled buff there is `unknown` (see the buff-filter note for the real case).
- The timeline needs the updated Go patch (`timelineBucketMs`).
