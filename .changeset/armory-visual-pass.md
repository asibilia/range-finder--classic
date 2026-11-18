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
fills from the export's `identity.sex`. The damage split's legend has no colour squares, and the segmented
controls (Current/BIS, Fight settings) are 38px tall with a raised pill
for the picked option.

Layout v2: Simulator Data sits open at the top of the right column, over
one glass card holding Stat Priority, the fight settings (moved out of
the band) and a light Run Simulator pill. The band under the gear card
has two columns (across the fight; the damage split, then the stat
weights) and the right column runs alongside it. Enemy levels are
coloured by the game's con rule (red, orange, yellow, green, grey by the
level difference, with Classic's green range), the picked one on a tint
of its colour. Across the fight draws about ten wide bar groups (the
smallest of 5, 10, 15, 20, 30, 60 or 120 seconds that is at least a
tenth of the fight), each the average DPS over its points, and the
footnote says how long each is. Run Simulator ships off for now: it shows
disabled with "Coming soon: running the sim here." until the browser reads
export formats 8 to 10. Its wiring is in place behind the page's
`runSimulator` switch: turned on, it sims the export behind the file again
for the fight settings (an export brought in this visit, or in dev the one
the dev server serves beside the latest file at /local/latest-export.lua)
and shows the new file; without an export it is disabled and says to bring
the export in. A slot that is the sim's
best for now, or empty, names the item it gets next: "Next: <item> at
level N", a link to the picker.
