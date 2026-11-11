---
'@goturbo/addon': minor
---

`/turbo macros` now works for every class and makes a macro for every spell on your bars, found automatically (#51). Offensive spells get a `/startattack` macro; every other spell (heals, totems, weapon buffs, Ghost Wolf) gets a plain `#showtooltip` / `/cast` macro that casts the top rank. Turbo's existing attack macros are reused. Spells with names past the game's 16-letter macro name limit (Flametongue Weapon, Strength of Earth Totem) get a macro named for their first 16 letters that still casts the full name.
