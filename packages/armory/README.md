# @goturbo/armory

The armory planner: a web page that opens a results file the gear sim made
offline and shows a character's gear, the sim's plan and its numbers. It is
not the Turbo site, and nothing in it ships with the addon.

## Run it

From the repo root:

1. `bun install`
2. `bun run dev:armory`
3. Open the local address it prints (http://localhost:5173 unless that port
   is taken).
4. Press `Or look at a sample character`, or open a results file of your own.

Files are read in the browser only; nothing is sent anywhere.

It is not deployed anywhere, and `tests/deploy-guard.test.ts` fails if a script or workflow deploys it.

Other scripts, all from the repo root: `bun run test:armory`,
`bun run type-check:armory`, `bun run build:armory` (writes the gitignored
`packages/armory/build/`; the page is `build/client/index.html`),
`bun run preview:armory` (builds, then serves the build the way Cloudflare
would, in a local Worker), `bun run armory:schema` (below) and
`bun run armory:check-widths`.

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
  (roles, starting mana, time between pulls) and the Tooltips (Provisional,
  a slot's full item name) are Base UI's. The segmented controls (enemy
  level, kind of fight, which talent build) are native radios in a
  fieldset (`components/segmented.tsx`).
- **Charts: Recharts 3** inside shadcn's `chart` (`ChartContainer`,
  `ChartTooltip`, `ChartLegend`): the fight chart (DPS and mana on two axes,
  out-of-mana lines) and the pull chart. The damage split and the stat
  weights are plain bars. What each chart is given is worked out first, in
  `src/chart-data.ts`, and tested on its own (`tests/chart-data.test.ts`);
  `tests/charts.test.tsx` draws each chart at a fixed size and checks its
  series. The drawings (`fight-plot.tsx`, `pull-plot.tsx`) load lazily
  (`React.lazy`), so the first load and the new-visitor screen carry no
  Recharts; a placeholder of the chart's height holds its place.
- **The layout is the approved mockup's**, element for element at 1440 px
  (`direction-c2-armory-planner.html`, `?roles=sliders`): the header (name,
  `Orc Enhancement Shaman, level 30. Guardian's Dualblade with Windfury
  Weapon.`, `Wishlist 0`, `Export Pawn string`); the gear pane with a column
  on its right (what the sim says, what to gear for, the Talents button)
  from 90rem, stacked below that; under both, a full-width band with the
  fight chart, the damage split and stat weights, and the fight settings;
  then a footer (the sample note, how sure the sim is). The gear pane's doll
  lays out by the pane's own width (a container query): the mockup's two
  268 px slot columns around the figure from 49rem, two columns below, one
  on a phone. Slots are one line for the name (an ellipsis when long; the
  full name in the button's name and a tooltip) and one for the note. The
  bottom row reads the file: a shaman with nothing for the off hand shows
  `Two-hand` and `Totem` (`src/slot-labels.ts`: the contract has no
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
  fight, the sliders and so the plan, worn or plan view, a bag item put on)
  is `src/planner-state.ts`: pure actions (`set-sliders`, `pick-plan`,
  `pick-fight`, `show-plan`, `show-worn`, `wear-bag-item`, `undo-bag-item`)
  that anything outside the components can apply with `applyPlannerAction`,
  which checks the action with Zod first. A slider stops at the picked
  plan's reach (`plans[].reach`) when the file has one.
- **Tailwind 4** with its preflight, scanning only the folders
  `src/styles.css` names with `@source` (the components, `app.tsx` and
  `error-boundary.tsx`), never the samples or the schema.

### Theme tokens

Every colour, radius and font is a CSS variable in `src/styles.css`:
shadcn's neutral tokens (`--background`, `--primary`, `--chart-1` to
`--chart-5`...) and ours (`--gain` for the gain pills, `--quality-*` for item
quality). Light and dark follow the system (`prefers-color-scheme`); there is
no toggle. A redesign is a change to those variables. In the charts,
`--chart-1` is DPS and the sim's plan, `--chart-2` is mana, and what you wear
is drawn in `--muted-foreground`. As text (labels, deltas, coloured times)
those colours are `--chart-1-text`, `--chart-2-text` and `--gain-text`,
darker in light mode so text reads at 4.5:1; `tests/contrast.test.ts` checks
the pairs from `src/styles.css`. Fonts are the system's; nothing is
downloaded.

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
- **Tests** stay on `bun test --isolate` with happy-dom (`tests/dom.js`);
  `tests/build-output.test.ts` builds the page and checks it.

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
- `talents.points` is the points spent in the tree (the sum of the ranks in
  `talents.yours`): `Talents: your build, 22 points`.
- Six optional fields (schema version 1 still) carry what the mockup shows
  beyond the first contract. Absent or null, the page leaves out only the
  part that needs them:

  | Field | Shown as | Absent or null |
  | --- | --- | --- |
  | `plans[].reach` `{damage, survival, healing, utility}` (0 to 100) | `Can reach 35 with this mix` / `No limit with this mix` under each slider, the track past it hatched, the slider stopping there, and the line `Raising one role lowers how far the others can go. ...` | No reach line, no hatching, sliders not stopped |
  | `sheet.weapon_skill` `{weapon_type, current, max}` (`weapon_type` is the game's skill name, `Two-Handed Axes`) | `Axe skill 148/150` on the sheet: the name said short (`src/weapon-skill.ts`; a name it doesn't know is shown as given) | The line is left out |
  | `bag_upgrades[].results` (results per fight with the bag item on, no `gear`) | `Wear them` on the bag card; once worn the slot, the readings and the chart use them, and `Undo` takes it off | No `Wear them` button |
  | `results[].damage_split[].school` (`physical`, `fire`, `nature`, `frost`, `arcane`, `shadow`, `holy`) | The split coloured by school, and `Colour is the spell school.` | Coloured by order, no colour sentence |
  | `fights[].melee_miss_pct` | `With 0 hit, you miss 8.0% of melee swings at level 33.` under the enemy level (hit from the sheet) | The sentence is left out |
  | `slots[].imbue` (the worn weapon's imbue) | `... Guardian's Dualblade with Windfury Weapon.` in the header | The weapon alone |

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
  intellect 4.04 and mana per 5 3.89, as the mockup shows them). The six
  optional fields are the mockup's numbers: the slider reach (the mockup's
  limits at each plan's mix), Two-Handed Axes 148/150, the miss chances 5.5, 6.0 and
  8.0% at levels 31, 32 and 33, the spell schools, `Windfury Weapon`, and
  the results with Berylline Pads on (the mockup's nudge: +0.4 DPS solo,
  +0.3 in the dungeon). Fight labels and Pawn labels are written the
  mockup's way (`Dungeon, 2 min vs level 33`, `Solo, level 30`).
- `src/sample-truncha-first-run.json` is shaped like the runner's first
  output: only the max damage plan, and every `timeline`, `pulls`,
  `time_to_die_s` and `out_of_mana_s` is null (not simmed), as is
  `talents.best`; it has none of the six optional fields. It opens on the
  same fight, with the same labels, as the full sample.
