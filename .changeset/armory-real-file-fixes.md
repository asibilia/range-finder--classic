---
'@goturbo/armory': patch
---

Read the first real results file right. A chain pull that runs out of mana now
counts as dry from `out_of_mana_s` (the pull its time falls in; a time in the
gap after a pull is the next pull), not from a `mana_end` of 0, since the sim
regains a little mana after 0. The sheet says the game's weapon skill names
short (`Two-Handed Axes` reads `Axe skill`), and it never grows past its
column, so the slots and gain pills no longer cover it. The contract says
`talents.points` is the points spent in the tree.
