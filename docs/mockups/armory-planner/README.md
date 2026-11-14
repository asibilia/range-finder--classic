# Armory planner mockups

Three directions for the main screen of a future Turbo armory planner: a web
viewer for the data the export addon writes, with the sim's gear and talent
picks and a Pawn string export. **Mockups only.** Each is one static HTML file
with fake numbers behind it. There is no sim, no backend and no real build.
Pick a direction, or mix parts of them; that becomes the brief for the real
thing.

The character is the owner's own Truncha (level 30 Orc Enhancement Shaman),
with the numbers from the 13 November gear report.

## Open them

Double-click any `.html` file, or:

```sh
open docs/mockups/armory-planner/direction-a-armory.html
```

They work offline. The fonts come from Google Fonts when you're online and fall
back to system fonts when you're not. The PNGs are captures at 1440 px wide:
`-main` is the first state, `-talents` has the talent modal open.

| Direction | Page | Main | Talents open |
| --- | --- | --- | --- |
| A, Armory | `direction-a-armory.html` | `direction-a-main.png` | `direction-a-talents.png` |
| B, Mixing desk | `direction-b-mixing-desk.html` | `direction-b-main.png` | `direction-b-talents.png` |
| C, Role compass | `direction-c-role-compass.html` | `direction-c-main.png` | `direction-c-talents.png` |

## The three ideas

- **A, Armory (closest to the owner's words).** A stone-and-storm character
  pane: the figure in the middle, every slot filled around it, and a floating
  card on the right with the fight chart, the sliders and the fight settings.
  Each slot with an upgrade has a glowing ember notch showing the gain.
- **B, Mixing desk.** The planner as a tuning instrument. A two-track fight
  recording runs across the top, with planned gear against what you wear. Tall
  faders re-tune the gear. A small gear rack beside them re-patches, with a log
  of what changed. Light, like brushed metal.
- **C, Role compass.** Truncha stands in a ring of 16 slots drawn like a night
  sky chart. The main control is a square role pad: drag one puck between
  damage, survival, healing and utility, and a shape shows what your items can
  reach.

## What all three do

- Every slot is filled, and slots where the sim suggests an upgrade are marked
  with the gain (EP, or DPS for the weapon).
- They show a DPS and mana chart across a 2-minute dungeon fight, with "out of
  mana at 0:48".
- They have damage, survival, healing and utility sliders, with damage at max
  to start. Moving them swaps between three ready-made gear sets and moves the
  other sliders' maximums. The part of a track you can't reach is hatched.
- Fight settings: enemy level 31/32/33, fight length, PvE or PvP, starting
  mana, and time between pulls. Starting mana and time between pulls move the
  out-of-mana point.
- The talent tree opens as a modal over the character. It shows "Best simmed"
  first and lets you switch to "Your build".
- Clicking a slot opens an item picker. It shows the current item, then
  alternatives ranked by upgrade, each with its source. You can equip an item
  or add it to the wishlist.
- "Export Pawn string" shows both Pawn scale strings, with a Copy button.
- The sliders and modals work by keyboard. The modals take focus, close with
  Esc, and give focus back to the button that opened them.

## What's real and what's faked

**Real:** these come from the 13 November report and his export:
- his character sheet and talents (21 points)
- the three sim DPS numbers (103.7 solo, 97.3 dungeon 30 s, 75.4 dungeon 2 min)
- the damage split and stat weights
- the items he wears, the top alternatives per slot, and their sources
- the Pawn strings

Every sim number is marked **provisional**: the sim isn't matched to real
fights yet.

**Faked:** these are made up to show the idea, and each page says so:
- the fight timeline curve
- the three gear sets beyond their item names and sources: max damage, damage
  and survival, max survival. Their DPS, health, armor and time to die are made
  up.
- the slider caps
- the nudge when you equip an item
- "time to die"
- the "Best simmed" talent build (Anticipation 1/3 moved into Flurry 5/5,
  +1.6 DPS)
- the talent tree's layout

Some items have no name in the sim's data, so the pages show them by ID, for
example "Unnamed cloak (279848)". He wears no trinkets.

The figure is an original placeholder ("3D model goes here"). Item icons are
simple original glyphs on tiles coloured by item quality. There is no game art.

## Questions the mockups raised

These are things a real design needs decided, and the mockups had to guess.

1. **What is "utility" measured in?** Crowd control uptime, number of
   interrupts, a score? Without a unit, the slider has nothing to drive. Healing
   needs the same answer (healing per second? only off-heals?). In the
   mockups, both move the caps but don't change gear.
2. **What does "survival" mean as a number?** The mockups use "time to die
   against a level 33 elite". Effective health, or damage taken per second,
   are other choices.
3. **Opening view: what you wear, or the sim's plan?** Damage starts at max, so
   the page could open on the max-damage set. A and B open on the plan, and C
   opens on what you wear. B shows both on one chart.
4. **How is a hybrid shown?** As two sliders up (A, B), or as one puck between
   two roles (C)? C's square pad can't show damage plus healing at once,
   because those two sit on opposite sides. A four-point radar would fix that.
5. **What happens to an item you picked by hand when the sliders change?** In
   the mockups it stays pinned. It could reset instead, or ask.
6. **Which items count?** Only items he can use now, up to level 33 (the
   report's range), or everything? The report's lists include Gloves of the
   Greatfather (needs 33) and a mail belt that a level 30 shaman can't wear.
   The mockups flag the level gaps, and the mail belt was taken out.
7. **When is an upgrade worth a glow?** Almost every slot has one at level 30.
   C only glows for +15 EP and up and shows a quiet badge for smaller gains.
8. **What does a new visitor with no export see?** None of the mockups covers
   that. It could be an empty doll with "Install the addon and type /tbexport",
   a sample character, or picking class, level and spec by hand.
9. **What is the fight chart's default fight?** The mockups use the 2-minute
   dungeon fight because that's where mana runs out. Solo 30 s is the
   report's headline.
10. **Is starting mana capped at the gear's mana pool?** In B it is. It could
    go past the pool, for example with buffs or a mana potion before the pull.
11. **What does PvP do?** In every mockup it only says "not simmed yet".
12. **Where do the wishlist and the bags hint live?** The "Berylline Pads are
    in your bags, +7.0 EP" hint is the easiest win on the page, and only A and
    C make it prominent.
13. **Is the Pawn export one scale or one per fight?** The report has two (solo
    and dungeon). The mockups show both.

## For the real build

- Self-host the fonts.
- Take the talent tree layout and item data from Forever's own data, not
  Classic's. Many items in the report are tagged as Classic data whose stats
  and sources may predate Forever.
