---
'@goturbo/addon': minor
---

`/turbo macros` now works for every class and makes a macro for every spell on your bars that has more than one rank, found automatically (#51), so learning a new rank needs no new button. Spells with one rank (Ghost Wolf) get none. Attacking spells get a `/startattack` macro, except crowd control that damage breaks (Gouge, Sap, Blind, Polymorph, Hibernate, Freezing Trap, Repentance, Shackle Undead, fears...), which gets a plain `#showtooltip` / `/cast` macro like heals and buffs. Spells with names past the game's 16-letter macro name limit (Flametongue Weapon, Strength of Earth Totem) get a macro named for their first 16 letters that still casts the full name.

Turbo no longer runs out of macro slots: it reuses its own macros (from earlier versions too), recycles or removes the ones nothing needs (giving one-rank spells their buttons back), and uses general macro slots once your character's are full. If there's still no room, it changes nothing and says how many slots to free and which of your macros aren't on your bars.
