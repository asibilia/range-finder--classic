Export reader files for #77, from the gear sim's clean commit `0476f3e` (`0476f3ec5990124fd212bdcac239c12f7b17d1ad`), which includes `buffsFromExport` (`58ba1d3`). Whole files, verbatim, in 3 parts under the comment limit. Fixtures in the tests are the made-up Testchar and the fake game, never his real export.

| File | Part | Since `62129e9` |
| --- | --- | --- |
| `local/sim/export.ts` | 1 | CHANGED: `sheet.healingPower` read from `sheet.spellHealing` (`42dfc47`). `buffsFromExport` (`58ba1d3`, Zod `safeParse`): each buff now keeps `source`, `points` and `description` (before, only name and spell id reached the buff rules, so format 8's numbers were never used; a row it can't read keeps only name and id). Formats 9 (`251449c`) and 10 (`0476f3e`) accepted: 2 to 10. |
| `local/lib/lua-vm.ts` | 1 | Not changed, but not in the #76 files: the Lua VM `readExport` uses (lua-wasm-bindings). |
| `local/char-export/reader.test.ts` | 1 | The addon's saved table read back by `readExport` and `characterFromExport`, and the key rule. It loads the addon's fake game from `export.test.ts` and the addon itself (not part of this handoff): port it with your own fake export, or drop it. |
| `local/sim/buffs.ts` | 2 | CHANGED: Forever's plural markup `|4singular:plural;` read as plain text (`5737bdb`). The reviewed allow-list rule (`58ba1d3`): `game_numbers` or "no sheet stats" only for a listed spell id whose description's numbered sentences are all read and equal the list's numbers; points only as a cross-check when non-empty; a missing description may be confirmed by the sheet against a clean calibration at the same level; else `unknown`. Each buff records the path that classified it (list / list + sheet cross-check / modelled / name rule / unknown). Format 10 sources (`0476f3e`): self, other player, not a player, unknown. |
| `local/sim/buff-allow-list.ts` | 2 | NEW (`58ba1d3`): Warchief's Blessing 16609 (Classic numbers, not in the sim's data; said so in the file), Blessing of Wisdom 19850 rank 2 and Thorns 782 rank 2 (from the sim's spell data), each with review notes. |
| `local/sim/checks.ts` | 2 | CHANGED (`58ba1d3`): `calibrate` passes the clean calibration to the sheet cross-check; the buffs row names each buff's path. The rest as in #76. |
| `local/sim/buffs.test.ts` | 3 | CHANGED: the allow-list rule on the level 33 buffs (Thorns and Blessing of Wisdom through the list, Warchief's Blessing unknown), the sheet cross-check with a fake clean calibration, the plural markup, format 10 sources. |
| `local/sim/buff-allow-list.test.ts` | 3 | NEW: one test per entry against its cited source. Two read the Go spell data (`sim/core/spelldata/spells_auto_gen.go`); in the port, read your built spell data instead. |

**Export formats since `62129e9`** (the addon; the reader only needs to accept them):
- 9: the `mobs` store never keeps a player-controlled unit or a unit with no creature id, and drops old `name:` entries (other players' pets got in that way); an XP gain with no dead target carries `lastFought` (marked, not confirmed).
- 10 (built, not yet installed): buff `source` is self / other player / not a player / unknown (from `isFromPlayerOrPlayerPet`); `descriptionMissing: "not loaded"` when the game hadn't loaded the spell's text; `pointsSeen` and `secretValues` (counted, never read).

**Notes for the port:** points are empty for nearly every aura in Forever (the probe saw `{}` on all 60), so the allow-list and the description carry the rule; keep "every numbered sentence read". The format check must accept 9 and 10.
