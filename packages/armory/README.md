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
would, in a local Worker) and `bun run armory:schema` (below).

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
- **Tailwind 4**, its theme and utilities only, with no preflight (base
  reset), so the page looks as it did. The plain rules in `src/styles.css`
  are unlayered and win over Tailwind's layers.
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
  best talent build, and the Berylline Pads' item id.
- `src/sample-truncha-first-run.json` is shaped like the runner's first
  output: only the max damage plan, and every `timeline`, `pulls`,
  `time_to_die_s` and `out_of_mana_s` is null (not simmed), as is
  `talents.best`.
