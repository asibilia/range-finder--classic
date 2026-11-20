# @goturbo/armory

The armory planner: a web page that shows a character's gear, the sim's
plan and its numbers. It opens a results file the gear sim made offline, or
sims a dropped `TurboCharExport.lua` (the export addon's SavedVariables
file) on the player's own computer with the **browser sim**
(`@goturbo/sim`, `packages/sim`: WoWSims built to WASM, run in Web
Workers). It is not the Turbo site, and nothing in it ships with the addon.

## Run it

From the repo root, with Go installed (the version in
`packages/sim/upstream/go.mod`; it builds the browser sim):

1. `bun install`
2. `bun run sim:build` (writes the gitignored `packages/sim/build/`, which
   the page serves at `/sim/`; run it again after the sim's Go changes)
3. `bun run dev:armory`
4. Open the local address it prints (http://localhost:5173 unless that port
   is taken).
5. Press `Or look at a sample character`, open a results file of your own,
   or drop a `TurboCharExport.lua` (in the game: `/tbexport`, then
   `/reload`) to sim that character here.

Files are read in the browser only; nothing is sent anywhere. An export is
simmed in the page's workers and never kept: the page fetches only its own
files (the sim and its data) and, in dev only, the dev server's `/local/`
files (below).

### Opening on your latest file (dev only)

`bun run dev:armory` can open straight onto the latest results file the gear
sim's session keeps on your computer, and follow it as it changes:

1. Copy `packages/armory/.local.example.json` to `packages/armory/.local.json`
   and set `latest_results_file` to the latest file's absolute path:
   `{ "latest_results_file": "/path/to/latest.json" }`. `.local.json` is
   gitignored, and the leak guard (`packages/sim/src/leak-scan.ts`) treats
   that path and its folder as machine words: `bun run check` fails if
   either turns up in the repo.
2. Beside the latest file, the sim's session writes `latest-status.json`:
   `{ made_at, export_saved_at, ok, reason, results_file }`, where `ok` is
   false (with a `reason`, or null) when it couldn't make a new file and
   kept the previous good one.
3. Start `bun run dev:armory` and open http://localhost:5173. With no
   usable config, or no latest file, the dev server warns once at start
   (`armory: no local latest file (...)`) and the page works as without it.

The dev server (`vite-plugin-latest.ts`, `apply: 'serve'`) serves three
paths, reading the config on each request: `/local/latest.json` (the
latest file, with `Last-Modified`; `If-Modified-Since` gets a 304 when it
hasn't changed), `/local/latest-status.json`, and `/local/latest-export.lua`
(the export the latest file was made from, which the sim side writes beside
it only when the two match; a 404 when it isn't there). All three are dev
only and never reach a build. Any other `/local/` path is
a 404, no part of a URL reaches the file system, and a request whose `Host`
isn't `localhost` or `127.0.0.1` gets a 403.

The page (`src/components/latest-file.tsx`, which loads
`src/local-latest.ts`) shows the latest file in place of the one kept in
this browser, without keeping it, and says `Loaded from this computer, made
Nov. 17` in the footer. Every 10 s it asks again, with
`If-Modified-Since`, and reads the status file:

- A newer file shows, keeping the fight and the plan view where it has
  them. One that doesn't read keeps the last one and says `The latest file
  from this computer couldn't be read; showing the last one that could.`
- A status with `ok: false` adds `Showing the previous good file because
  <reason>.`

`Open another file` in the header, or a file dropped anywhere on the page,
shows that file (a results file or an export) and stops following; `Back to
the latest from this computer` goes back and follows again.

None of it reaches `bun run build:armory`: the plugin only serves, and in a
build the page's hook is inert, so Rollup leaves out its code, its words and
`src/local-latest.ts`. `tests/build-output.slow.test.ts` fails if the build
carries a trace of it, and its network rule (`tests/network-rule.ts`) lets
`src/local-latest.ts` fetch only `'/local/'` strings, beside the sim's
loader's `new URL(` fetches.

### Simming an export

Dropping a `.lua` reads the export, checks it (its format; Enhancement
Shaman only for now; buffs the sim can't model), runs the sim's gates, then
sims worn gear and the max damage plan with the precomputed stat weights for
the character's level band (`packages/sim/weights/`). With no weights file
for the band it sims the weights on the device first, and says so with a
time estimate. `Refine for your gear` sims the weights for the character's
own gear. The file it makes is shown and kept like any results file.

### What the page keeps in your browser

One thing: the text of the last results file you opened (picked or
dropped) or the browser sim made, if it read OK, in `localStorage` under the
key `armory:last-results-file`, so a reload brings your character back. The
export itself is never kept. Opening another file replaces it; the bundled
sample (`Or look at a sample character`) is never kept. While a kept file is shown the footer says
`This file is kept in this browser only.` with a `Forget this file` button,
which clears the key and goes back to the new-visitor state.

- On load the kept text goes through the same checks as a file you open
  (`readResultsFile`), in the browser only, after the page has drawn: the
  prerendered page is always the new-visitor state. A kept file that is no
  longer JSON or no longer validates (a newer page, say) is removed, and the
  new-visitor card says `The results file this browser kept no longer reads,
  so it was forgotten.`
- When storage is unavailable (reading it throws, as in some privacy modes)
  or full (`QuotaExceededError`), the page works as before and just doesn't
  remember; it doesn't show the "kept" line then.
- `src/remembered-file.ts` is the only code that touches storage.
  `tests/build-output.slow.test.ts` fails if any other file uses `localStorage`,
  or if any file uses `sessionStorage`, `indexedDB`, cookies, `caches` or
  another `localStorage` key.

It is not deployed anywhere, and `tests/deploy-guard.test.ts` fails if a script or workflow deploys it.

Other scripts, all from the repo root: `bun run test:armory`,
`bun run type-check:armory`, `bun run build:armory` (writes the gitignored
`packages/armory/build/`; the page is `build/client/index.html`, the sim's
files are copied to `build/client/sim/`), `bun run preview:armory` (builds,
then serves the build the way Cloudflare would, in a local Worker),
`bun run armory:schema` (below), `bun run sim:record` and
`bun run armory:check-widths`. `build:armory` and `preview:armory` need
`bun run sim:build` first: without the sim's build they stop and say so.

`sim:record` (`scripts/record-sim.ts`) runs the page's test scenarios
through the real WASM and writes `tests/fixtures/sim-outputs.json`, which
the page tests' fake pool answers from. Run it again when a change alters
the requests the browser sim sends (its iterations, fights, gates or
rotation); it takes a few minutes.

`armory:check-widths` (`scripts/check-widths.ts`) is a manual check, not part
of `bun run check`: it serves the build (run `bun run build:armory` first)
and, through the `playwright-cli` command if you have it (it is not a
dependency here), measures the page at 390, 1024, 1280, 1366, 1440 and 1920
px. It fails when the gear pane's middle column, the new-visitor card, the
sheet or the chart gets too narrow, a control (a button, a select, a slider)
is clipped, a gain pill hangs past the gear card, or the page scrolls
sideways. Slot names may end in an ellipsis, as the mockup's do: the full
name is in the slot button's name and its tooltip. happy-dom lays nothing out,
so the tests can't check this. Without `playwright-cli` it says so and exits.

## The stack

- **React Router 8, framework mode**, on **Vite**, with
  **`@cloudflare/vite-plugin`** and **Wrangler**: the same stack as the
  owner's other sites. Version 8, not 7: it is the current major, the one
  those sites run, so the two stay on one set of versions. Its command-line
  tools run under Node, and need Node 22.22 or newer.
- **One page, prerendered.** `/` is the only route (`src/routes.ts`,
  `src/routes/home.tsx`). The build renders it to a static file;
  `react-router.config.ts` keeps `ssr: true` because SPA mode does not work
  with the Cloudflare plugin. The page has no loaders or actions and lists
  every route up front (`routeDiscovery: 'initial'`), so it never asks the
  Worker for data.
- **A Worker with nothing in it** (`workers/app.ts`, `wrangler.jsonc`): no
  bindings, no storage, no outbound requests, no public hostname yet.
  `tests/worker.test.ts` checks that.
- **UI: shadcn/ui on Base UI** (`components.json`: style `base-nova`,
  neutral, icons from `lucide-react`). shadcn's components are copied into
  `src/components/ui/` as our own source; the page's components are in
  `src/components/`. Dialogs (focus moves to Close, Tab stays inside,
  Escape closes, focus goes back), the fight length Select, the Sliders
  (roles, starting mana, time between pulls), the Tooltips (Provisional,
  a slot's full item name) and the Popovers behind the "i" buttons are Base
  UI's. An "i" button (`components/info.tsx`, on `components/ui/popover.tsx`)
  is named `About <label>`, and its popover opens on hover, on click or tap,
  and on Enter or Space; Escape closes it and focus stays on the button. The
  segmented controls (the `Current` / `BIS` switch, `Shape` / `Sliders`,
  enemy level, kind of fight, which talent build) are native radios in a fieldset
  (`components/segmented.tsx`).
- **Charts: Recharts 3** inside shadcn's `chart` (`ChartContainer`,
  `ChartTooltip`, `ChartLegend`): the fight chart (DPS and mana on two axes,
  out-of-mana lines) and the pull chart. The damage split and the stat
  weights are plain bars. What each chart is given is worked out first, in
  `src/chart-data.ts`, and tested on its own (`tests/chart-data.test.ts`);
  `tests/charts.test.tsx` draws each chart at a fixed size and checks its
  series. The drawings (`fight-plot.tsx`, `pull-plot.tsx`) load lazily
  (`React.lazy`), so the first load and the new-visitor screen carry no
  Recharts; a placeholder of the chart's height holds its place.
- **The layout is the approved mockup's** (`direction-c2-armory-planner.html`,
  `?roles=sliders`), restyled to the owner's design (spec #109): the header
  (`Armory`, the tagline `See your gear, what the sim would change, and how
  a fight plays out.`, `Wishlist 0`, `Export Pawn string`); the gear pane,
  headed by the character's name, `Level 30 Enhancement Shaman` and the
  weapon line (`Guardian's Dualblade with Windfury Weapon.`), with the
  `Current` / `BIS` switch, the total line (`↓ 195.2 EP in total below the
  sim's best set, ...`), the callout card under the left slots (the one best
  next step) and the talents pill on the figure; a column on its right
  (Simulator Data: the readings `Solo`, `Dungeon`, `Resource Empty`,
  `Health`, `Armor` and `Lifespan`, with how far what you wear is below the
  sim's plan; Stat Priority: the C2a Shape by default, with a Sliders view)
  from 90rem, stacked below that; under
  both, a full-width band with the fight chart, the damage split and stat
  weights, and the fight settings; then a footer (the sample note, how sure
  the sim is). The gear pane's doll lays out by the pane's own width (a
  container query): the mockup's two 268 px slot columns around the figure
  from 49rem, two columns below, one on a phone. Slots are one line for the
  name (an ellipsis when long; the full name in the button's name and a
  tooltip), with its gap to the plan (`↓ 16.7`) or `BIS`, and under the
  button one line for the note: `Best: <item>` for a slot with a gap (a link
  that opens the item picker on that item), else where the worn item comes
  from. The bottom row reads the file: a shaman with nothing for the off
  hand shows `Two-hand` and `Totem` (`src/slot-labels.ts`: the contract has no
  two-handed flag, so an empty off hand with no off-hand alternative, plan
  item or bag upgrade reads as a two-hander).
- **The fight settings pick a pre-made fight** (`src/fight-settings.ts`):
  enemy level (31, 32, 33), fight length (30 seconds to 5 minutes), kind of
  fight (PvP: not simmed yet), starting mana and time between pulls, as the
  mockup has them. The fight whose level, length, starting mana and (for a
  chain) gap match is shown; any other combination says `Not simmed for
  this combination.`, keeps the chart and readings on the last fight, and
  lists the file's fights to pick from. Nothing is re-simmed.
- **State as plain actions.** What the page shows for a loaded file (the
  fight, the sliders and so the plan, worn or plan view, bag items put on)
  is `src/planner-state.ts`: pure actions (`set-sliders`, `pick-plan`,
  `pick-fight`, `show-plan`, `show-worn`, `wear-bag-item`,
  `wear-all-bag-items`, `undo-bag-item`)
  that anything outside the components can apply with `applyPlannerAction`,
  which checks the action with Zod first. A slider stops at the picked
  plan's reach (`plans[].reach`) when the file has one.
- **Tailwind 4** with its preflight, scanning only the folders
  `src/styles.css` names with `@source` (the components, `app.tsx` and
  `error-boundary.tsx`), never the samples or the schema.

### Theme tokens

Every colour, radius and font is a CSS variable in `src/styles.css`:
shadcn's neutral tokens (`--background`, `--primary`, `--chart-1` to
`--chart-5`...) and ours (`--gain` for the gain pills, `--owned` for BIS,
`--quality-*` for item quality). The page is dark only: one theme, in
`:root`, and `<html>` always has the class `dark`. The accent `--primary` is
the owner's orange. A redesign is a change to those variables. In the charts,
`--chart-1` is DPS and the sim's plan, `--chart-2` is mana, and what you wear
is drawn in `--muted-foreground`. As text (labels, deltas, coloured times)
those colours are `--chart-1-text`, `--chart-2-text` and `--gain-text`;
`tests/contrast.test.ts` checks the pairs from `src/styles.css` (text at
4.5:1). Fonts are the system's; nothing is downloaded. Numbers (slot badges,
stat values, stat weights, readings) use `font-mono`.

### Adding a shadcn component

From `packages/armory`: `bunx --bun shadcn@latest add <component>` (pin the
CLI to a release older than a week, like the dependencies). Then:

1. Move any new dependency it added to the root `workspaces.catalog` and
   reference it as `"catalog:"` here (`syncpack lint` fails otherwise).
2. Drop its `"use client"` line (this page has no server components) and run
   `bun run lint:fix` from the root, which formats it our way.
3. Read the file: it is ours now. Keep shadcn's code; mark any change with a
   comment starting `Ours:`.

Imports use shadcn's `@/` alias for `src/` (`@/components/ui/button`):
`paths` in `tsconfig.json`, `resolve.alias` in `vite.config.ts`.

- **Errors**: a render error shows "Something went wrong showing this file."
  and Start over, from the home route's `ErrorBoundary`
  (`src/error-boundary.tsx`).
- **Tests**: the fast set runs on `bun test --isolate` with happy-dom
  (`tests/dom.js`). `bun run test:slow` runs the slow files, including
  `tests/build-output.slow.test.ts`, which builds the page and checks it.

### Character art

The gear card shows a picture for the character's race, class and gender
behind the tiles (the owner's own art). The page reads only the manifest,
`public/art/art.json` (`{ race, class, gender, url, width, height, bytes }`,
checked by `src/character-art.ts`, imported at build time), and follows each
entry's `url`. With no picture for that gender, it shows the other gender's;
with none for the pair, the plain card.

Add one with `bun run art:add <file> --race <Race> --class <Class> --gender
<male|female>` (needs `cwebp`: `brew install webp`): a 1024 px wide WebP at
quality 78 (about 40 KB) named `public/art/<race>-<class>-<gender>.webp`,
and its manifest entry. The script's `ART_TARGET` is the one setting: moving
the art to a storage bucket later changes it (and the entries' URLs), and
puts the bucket's host on the build guard's list; no page code changes.

## The results file contract

- `src/results-file.ts` is the source of truth: the Zod schema the page reads
  files with, its cross-field rules and their messages.
- `src/results-file.schema.json` is the JSON Schema generated from it, for the
  gear sim's runner to validate against. Never edit it by hand: change the Zod
  schema and run `bun run armory:schema` (the script is
  `scripts/write-results-schema.ts`). A test fails when the committed file
  differs from a fresh one.
- In every part of the file, null means "not simmed".
- **Which pull ran dry** on a chain fight comes from the result's
  `out_of_mana_s` (wall time from the start of pull 1, gaps included), not
  from a pull's `mana_end`: after running dry the sim regains a little, so a
  dry pull can end at 28 mana. Pull k runs from `(k-1)*(duration_s + gap_s)`
  to that plus `duration_s` (the fight's `setup.gap_s`), both ends included.
  A time in the gap after a pull counts as the next pull (you start it with
  no mana); a time past the last pull is said as a time (`run out of mana
  at 3:01`). `never` reads `keep mana through every pull`; null, the
  not-simmed sentence. The rule is `dryPull` in `src/mana-words.ts`.
- `left_out_items` (optional) lists items the sim left out of every plan
  (`{item_id, name, reason}`), apart from `checks`. How sure is this? lists
  them under `Left out of the plan:`, one line each: `Made-up Hood of Nowhere
  (99901), because it has no source and needs level 1.` Each `item_id`
  appears once (the page refuses a repeat). Absent or empty: no list.
- `checks[].not_checked` (optional) marks a check that could not be made. It
  must have `passed: false` (so older readers cannot count it as a pass), never
  blocks a gate, and is excluded from ordinary pass/fail counts. How sure is
  this? reports `<p> checks passed, <f> failed, <n> not checked.` and prefixes
  each row `Passed:`, `Failed:` or `Not checked:`. A failed optional bag preview
  adds a `bag_preview` not-checked row and hides only its Equip control.
- `talents.points` is the points spent in the tree (the sum of the ranks in
  `talents.yours`), shown on the talents pill on the character: `22 pts`.
  When `talents.best.dps_gain` shows as 3.0 or more, the pill gets an
  orange dot and `↓ N DPS` beside it.
- Nine optional fields (schema version 1 still) carry what the mockup and
  the owner's design (spec #109) show beyond the first contract: the first
  six for the mockup, the last three for the callout card. Absent or null,
  the page leaves out only the part that needs them. The browser sim writes
  professions and the bag-preview fields when their data applies; quick fixes
  remain a contract the page reads when a runner supplies them.

  | Field | Shown as | Absent or null |
  | --- | --- | --- |
  | `plans[].reach` `{damage, survival, healing, utility}` (0 to 100) | `Can reach 35 with this mix` / `No limit with this mix` under each slider, the track past it hatched, the slider stopping there, and the line `Raising one role lowers how far the others can go. ...` | No reach line, no hatching, sliders not stopped |
  | `sheet.weapon_skill` `{weapon_type, current, max}` (`weapon_type` is the game's skill name, `Two-Handed Axes`) | `Axe skill 148/150` on the sheet: the name said short (`src/weapon-skill.ts`; a name it doesn't know is shown as given) | The line is left out |
  | `bag_upgrades[].results` (results per fight with the bag item on, no `gear`) | `Equip` on the callout card; once worn the slot, the readings and the chart use them, and `Undo` takes it off | No `Equip` button |
  | `results[].damage_split[].school` (`physical`, `fire`, `nature`, `frost`, `arcane`, `shadow`, `holy`) | The split coloured by school, and `Colour is the spell school.` | Coloured by order, no colour sentence |
  | `fights[].melee_miss_pct` | `With 0 hit, you miss 8.0% of melee swings at level 33.` under the enemy level (hit from the sheet) | The sentence is left out |
  | `slots[].imbue` (the worn weapon's imbue) | `... Guardian's Dualblade with Windfury Weapon.` under the gear card's heading | The weapon alone |
  | `character.professions` `[{name, skill, max}]` (`Leatherworking`, 165 of 225; matched by `name` only, `skill` and `max` unused for now) | On the callout card, an item crafted by you (a `crafted` item one of whose `source.text` parts reads `Crafted: Leatherworking`) is the first to go get: `You can make Totemic Leather Tunic with your Leatherworking, +6.0 EP on your chest piece.` | No "crafted by you": crafted items rank with the other crafted ones. An empty list: the same |
  | `quick_fixes` `[{kind, slot, dps_gain, text}]` (`kind` is `imbue`, `empty_slot` or `weapon_skill`; `slot` any slot or null; the sim words `text`) | The callout card's quick fix, for the biggest fix worth 3.0 DPS or more: `<text> Putting it back is worth about +18.2 DPS.` (`Filling it ...` for an empty slot, `Training it up ...` for weapon skill), then `Also: <text> (+4.0 DPS).` for the others worth as much | No quick-fix state. An empty list: the same |
  | `bag_upgrades_all` `{results}` (what you wear with every bag upgrade on together: one result per fight, no `gear`; only with two or more bag upgrades, each in a different slot) | `Equip all N` on the callout card with several bag upgrades; once worn, the slots, the readings and the chart use them, and `Undo` takes them all off | No `Equip all` button |

## The two samples

Both are hand-made for Truncha (`sample: true`), from his 13 November 2026
report, and the page shows a note that some numbers are made up.

- `src/sample-truncha.json` (`provisional: true`) opens on the 2-minute
  dungeon fight (`dungeon-long`), as the mockup does. Made up are the plans
  other than max damage (and max damage's chest and wrist, set to the
  mockup's), every result number except the DPS for what he wears (so the
  timelines, drawn with the mockup's own curve, the pulls, the out-of-mana
  times and the times to die), the best talent build, the Berylline Pads'
  item id, the 2-minute fight's gap between pulls (10 s, the mockup's), and
  the stat weights of the 2-minute and chain fights (the solo fight's, but
  intellect 4.04 and mana per 5 3.89, as the mockup shows them), and the one
  `left_out_items` entry (Made-up Hood of Nowhere, item 99901, so the
  left-out list in How sure is this? shows). The mockup's six
  optional fields are the mockup's numbers: the slider reach (the mockup's
  limits at each plan's mix), Two-Handed Axes 148/150, the miss chances 5.5, 6.0 and
  8.0% at levels 31, 32 and 33, the spell schools, `Windfury Weapon`, and
  the results with Berylline Pads on (the mockup's nudge: +0.4 DPS solo,
  +0.3 in the dungeon). Fight labels and Pawn labels are written the
  mockup's way (`Dungeon, 2 min vs level 33`, `Solo, level 30`).
- `src/sample-truncha-first-run.json` is shaped like the runner's first
  output: only the max damage plan, and every `timeline`, `pulls`,
  `time_to_die_s` and `out_of_mana_s` is null (not simmed), as is
  `talents.best`; it has none of the mockup's six optional fields, and no
  `left_out_items`. It opens on the
  same fight, with the same labels, as the full sample.

Neither sample has the callout card's three fields (`character.professions`,
`quick_fixes`, `bag_upgrades_all`); the tests build files with them.
