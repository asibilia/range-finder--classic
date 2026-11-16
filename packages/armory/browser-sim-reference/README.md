# The offline runner, for the fixes before slice B merges (read-only)

The gear sim's offline runner, verbatim, so the ticket agents can match the browser port to it:

- `76-runner-files-*`: the runner at commit `62129e9` (index and parts 1–4).
- `77-export-reader-*`: its export reader at commit `0476f3e` (`export.ts`, `buffs.ts`, `buff-allow-list.ts`, `checks.ts` and their tests).

Port from these into `packages/armory/src/browser-sim/`; don't import or build them. They're Markdown, so lint, the type-check, the tests and the build don't read them. Tests ported from them use the made-up GUID `Player-1-0000000A` where the runner's tests use theirs.

**The last ticket of the fixes spec deletes this folder.**
