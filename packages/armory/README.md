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
4. Press `Look at a sample character`, or open a results file of your own.

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
sheet or the chart gets too narrow, a slot name is cut off, a gain pill hangs
past the gear card, or the page scrolls sideways. happy-dom lays nothing out,
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
  Escape closes, focus goes back), the fight Select, the role Sliders, the
  talents RadioGroup and the Provisional Tooltip are Base UI's.
- **Charts: Recharts 3** inside shadcn's `chart` (`ChartContainer`,
  `ChartTooltip`, `ChartLegend`): the fight chart (DPS and mana on two axes,
  out-of-mana lines) and the pull chart. The damage split and the stat
  weights are plain bars. What each chart is given is worked out first, in
  `src/chart-data.ts`, and tested on its own (`tests/chart-data.test.ts`);
  `tests/charts.test.tsx` draws each chart at a fixed size and checks its
  series. The drawings (`fight-plot.tsx`, `pull-plot.tsx`) load lazily
  (`React.lazy`), so the first load and the new-visitor screen carry no
  Recharts; a placeholder of the chart's height holds its place.
- **The layout is the approved mockup's**: the gear with a card on its
  right (what the sim says, what to gear for, the Talents button) from
  90rem (1440 px), stacked below that; under both, a full-width band with
  the fight chart, the damage split and stat weights, and the fight
  settings (the fight picker). The gear pane's doll lays out by the pane's
  own width (a container query): three columns around the figure from 49rem,
  two below, one on a phone.
- **State as plain actions.** What the page shows for a loaded file (the
  fight, the sliders and so the plan, worn or plan view) is
  `src/planner-state.ts`: pure actions (`set-sliders`, `pick-plan`,
  `pick-fight`, `show-plan`, `show-worn`) that anything outside the
  components can apply with `applyPlannerAction`, which checks the action
  with Zod first.
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

## The two samples

Both are hand-made for Truncha (`sample: true`), from his 13 November 2026
report, and the page shows a note that some numbers are made up.

- `src/sample-truncha.json` (`provisional: true`): made up are the plans other
  than max damage, every result number except the DPS for what he wears (so
  the timelines, the pulls, the out-of-mana times and the times to die), the
  best talent build, the Berylline Pads' item id, and the chain fight's
  (`chain-4`) stat weights, copied from the 2-minute dungeon fight's so the
  page's first screen (it opens on the chain fight) isn't half empty.
- `src/sample-truncha-first-run.json` is shaped like the runner's first
  output: only the max damage plan, and every `timeline`, `pulls`,
  `time_to_die_s` and `out_of_mana_s` is null (not simmed), as is
  `talents.best`.
