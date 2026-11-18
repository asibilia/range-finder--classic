---
'@goturbo/armory': patch
---

Armory: the first part of the visual pass to the owner's design. The theme
takes the design's tokens (colours, type scale, radii, spacing), with
`glass` and `pill` utilities and a light `pill` button; numbers are in
JetBrains Mono, self-hosted. The header loses its extra lines (where a file
came from moves to the footer) and Export Pawn string is the light pill.
The gear card's heading puts the name and level on one line, and the total
sits in an orange badge. Simulator Data shows a gap from the sim's plan
under every reading (orange below it, green above), Resource Empty and
Lifespan in hundredths. Sliders are white. Dates read "Nov. 17".

The gear tiles are dark glass with three lines: the slot (with "better in
bags" inline), the item, and `Best: <item>` inside the tile (no icon) or
the first part of the item's source. Icon squares are empty, bordered in
the item's quality colour; gap and BIS badges are small rectangles inside
the tile. The figure placeholder is gone (the art comes next); the talents
pill is the light pill at the stat sheet's top right, the sheet a glass
panel with short labels ("Sp. Crit", "Wp. Skill") over "Data exported
Nov. 17, as worn." The callout card is a plain glass box with light pill
buttons. Spacing follows the design in the header, the gear card's
heading, the Stat Priority sliders and the reading gap lines.

The gear card shows the character's art behind the tiles (the owner's
own; the first is the male Orc Shaman), from a manifest
(`public/art/art.json`) the page reads at build time and follows by URL,
so the pictures can move to a storage bucket later. With no picture for
the character's gender it shows the other gender's; with none for the
race and class, the plain card. `bun run art:add` converts a picture to a
1024 px WebP at quality 78 and writes its manifest entry. The footer says
the art is the owner's own when it shows. The results file gains an
optional `character.gender` (`male` or `female`), which the browser sim
fills from the export's `identity.sex`. Across the fight, DPS is drawn as
thin bars, two to each time point, with mana over them; points too close
for 1 px bars are grouped, and the footnote says how far apart the bars
are. The damage split's legend has no colour squares, and the segmented
controls (Current/BIS, Fight settings) are 38px tall with a raised pill
for the picked option.
