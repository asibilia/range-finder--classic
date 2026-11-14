# @goturbo/armory

The armory planner: a web page that opens a results file the gear sim made
offline and shows a character's gear, the sim's plan and its numbers. It is
not the Turbo site, and nothing in it ships with the addon.

## Run it

From the repo root:

1. `bun install`
2. `bun run dev:armory`
3. Open the local address it prints.
4. Press `Look at a sample character`, or open a results file of your own.

Files are read in the browser only; nothing is sent anywhere.

Other scripts, all from the repo root: `bun run test:armory`,
`bun run type-check:armory`, `bun run build:armory` (writes the gitignored
`packages/armory/dist/`) and `bun run armory:schema` (below).

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
