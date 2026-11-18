# @goturbo/armory

## 0.1.0-beta.0

### Minor Changes

- [#70](https://github.com/asibilia/range-finder--classic/pull/70) [`afe9e5b`](https://github.com/asibilia/range-finder--classic/commit/afe9e5b97098eb3c7ebcfc15eb8d9c7883737afa) Thanks [@asibilia](https://github.com/asibilia)! - The armory planner now matches the approved mockup element for element at 1440 px: the header line names the weapon and its imbue, the gear pane has the mockup's compact one-line slots (full names in a tooltip) with Two-hand and Totem for a shaman with a two-hander, the bag card has Wear them and Undo, the sheet has the weapon skill, the readings are the mockup's six, the sliders say how far each role can reach with the track past it hatched, the stat weights are solo against the 2-minute fight, the damage split is coloured by spell school, and the fight settings are the mockup's controls (enemy level, fight length, kind of fight, starting mana, time between pulls) picking among the file's pre-made fights. The full sample opens on the 2-minute dungeon fight. The results file gains six optional fields for this (schema version 1): `plans[].reach`, `sheet.weapon_skill`, `bag_upgrades[].results`, `damage_split[].school`, `fights[].melee_miss_pct` and `slots[].imbue`.

- [#69](https://github.com/asibilia/range-finder--classic/pull/69) [`b328b97`](https://github.com/asibilia/range-finder--classic/commit/b328b97bea01a0427ff8ef45112ef2ee081f57bd) Thanks [@asibilia](https://github.com/asibilia)! - The armory planner moves from Bun's HTML bundler to React Router 8 (framework mode) on Vite, with `@cloudflare/vite-plugin`, Wrangler and Tailwind 4 (no preflight). The page is prerendered from one route and looks and behaves as before. The Worker has no bindings and makes no requests. The error boundary is now the home route's `ErrorBoundary` (`react-error-boundary` is gone). New root script: `preview:armory`. The build now writes `packages/armory/build/`.

- [#72](https://github.com/asibilia/range-finder--classic/pull/72) [`230fc0c`](https://github.com/asibilia/range-finder--classic/commit/230fc0c10c67b2e56b10bff02a76da194c3bb935) Thanks [@asibilia](https://github.com/asibilia)! - Remember the last results file in this browser, so a reload doesn't start
  empty. The page keeps the text of the last file picked or dropped that read OK
  in `localStorage` under one key, `armory:last-results-file` (never the bundled
  sample), reads it back through the same checks on load, and forgets it with a
  note if it no longer reads. `Forget this file` in the footer clears it. When
  storage is unavailable or full the page works as before, without remembering.
  Nothing else is stored and nothing is sent anywhere.

- [#70](https://github.com/asibilia/range-finder--classic/pull/70) [`afe9e5b`](https://github.com/asibilia/range-finder--classic/commit/afe9e5b97098eb3c7ebcfc15eb8d9c7883737afa) Thanks [@asibilia](https://github.com/asibilia)! - The armory planner is rebuilt on shadcn/ui (Base UI) with Recharts charts, and looks like the approved mockup again: one combined DPS and mana fight chart with out-of-mana lines, a pull chart, a stacked damage split, stat weights against the 2-minute fight, gain pills, level and bag chips, readings with the change from what you wear, round talent tiles, and the new-visitor card in the gear pane. As in the mockup, the fight chart, damage split, stat weights and fight settings sit in a full-width band under the gear, the card on the right keeps the readings (solo and dungeon DPS side by side), the role sliders and the Talents button, and the layout holds at every width from a phone up. The charts load only once a character is shown. Light and dark follow the system.

- [#68](https://github.com/asibilia/range-finder--classic/pull/68) [`6fc986b`](https://github.com/asibilia/range-finder--classic/commit/6fc986bbdf126fa24d397a7d1e7b035f825e1baa) Thanks [@asibilia](https://github.com/asibilia)! - Spec: armory planner, slice A (a viewer with pre-made numbers) ([#56](https://github.com/asibilia/range-finder--classic/issues/56))

- [#86](https://github.com/asibilia/range-finder--classic/pull/86) [`3ed1d60`](https://github.com/asibilia/range-finder--classic/commit/3ed1d606f6ba8367b231a5409df66655bd04fe4d) Thanks [@asibilia](https://github.com/asibilia)! - Spec: armory planner, slice B (the sim runs in the browser) ([#73](https://github.com/asibilia/range-finder--classic/issues/73))

### Patch Changes

- [#71](https://github.com/asibilia/range-finder--classic/pull/71) [`51875fd`](https://github.com/asibilia/range-finder--classic/commit/51875fd070cce6b9274ea16ab21238f9875087d2) Thanks [@asibilia](https://github.com/asibilia)! - Read the first real results file right. A chain pull that runs out of mana now
  counts as dry from `out_of_mana_s` (the pull its time falls in; a time in the
  gap after a pull is the next pull), not from a `mana_end` of 0, since the sim
  regains a little mana after 0. The sheet says the game's weapon skill names
  short (`Two-Handed Axes` reads `Axe skill`), and it never grows past its
  column, so the slots and gain pills no longer cover it. The contract says
  `talents.points` is the points spent in the tree.
  Items the sim leaves out of its plans now have their own optional field,
  `left_out_items`, listed under `Left out of the plan:` in How sure is this?
  and not counted with the checks.

- [#125](https://github.com/asibilia/range-finder--classic/pull/125) [`be3305f`](https://github.com/asibilia/range-finder--classic/commit/be3305f82a78b6d43ca5ef1d558a3b47d2a22fda) Thanks [@asibilia](https://github.com/asibilia)! - Armory: the first part of the visual pass to the owner's design. The theme
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

- [#108](https://github.com/asibilia/range-finder--classic/pull/108) [`0cb5e2e`](https://github.com/asibilia/range-finder--classic/commit/0cb5e2ee432a8afb4b1158de58ffe64447cb96ca) Thanks [@asibilia](https://github.com/asibilia)! - Spec: the armory opens on the owner's latest results file (dev only) ([#105](https://github.com/asibilia/range-finder--classic/issues/105))

- [#124](https://github.com/asibilia/range-finder--classic/pull/124) [`1227f83`](https://github.com/asibilia/range-finder--classic/commit/1227f830df4ef577d8fd479785490584010c5939) Thanks [@asibilia](https://github.com/asibilia)! - Spec: armory design pass (the owner's design) ([#109](https://github.com/asibilia/range-finder--classic/issues/109))

- [#86](https://github.com/asibilia/range-finder--classic/pull/86) [`3ed1d60`](https://github.com/asibilia/range-finder--classic/commit/3ed1d606f6ba8367b231a5409df66655bd04fe4d) Thanks [@asibilia](https://github.com/asibilia)! - Spec: armory planner, slice B fixes before merge ([#88](https://github.com/asibilia/range-finder--classic/issues/88))

- [#126](https://github.com/asibilia/range-finder--classic/pull/126) [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356) Thanks [@asibilia](https://github.com/asibilia)! - The armory's tests split into fast and slow files. The ones that run the
  real WASM sim or a production build (`browser-sim`, `build-output`,
  `vite-plugin-sim`, `vite-plugin-latest`, and half of `sim-export`,
  `export-reader` and `unknown-items`) are now `*.slow.test.ts`; the fast
  files give no test a time limit above 2 seconds. The Pawn dialog's Copy
  test runs on fake timers instead of waiting 2.6 real seconds.

- [#126](https://github.com/asibilia/range-finder--classic/pull/126) [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356) Thanks [@asibilia](https://github.com/asibilia)! - The armory's real-sim tests make pools of 2 workers, not the default (the
  computer's cores minus one, up to 8), so a test file no longer loads the
  sim up to eight times over.

- [#126](https://github.com/asibilia/range-finder--classic/pull/126) [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356) Thanks [@asibilia](https://github.com/asibilia)! - `test:armory` gives each test 2 seconds (`--timeout=2000`) and skips the
  `*.slow.test.ts` files, which run through the root `test:slow`. The
  package's `test` script calls the root `test:armory`.
- Updated dependencies [[`0cb5e2e`](https://github.com/asibilia/range-finder--classic/commit/0cb5e2ee432a8afb4b1158de58ffe64447cb96ca), [`3ed1d60`](https://github.com/asibilia/range-finder--classic/commit/3ed1d606f6ba8367b231a5409df66655bd04fe4d), [`3ed1d60`](https://github.com/asibilia/range-finder--classic/commit/3ed1d606f6ba8367b231a5409df66655bd04fe4d), [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356), [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356), [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356)]:
  - @goturbo/sim@0.1.0-beta.0
