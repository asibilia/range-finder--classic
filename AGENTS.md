# Turbo — agent guide

Turbo is a small addon for **WoW: Forever**, made by the Turbo crew: it makes
attack macros (`/turbo macros`, `/tb macros`) from the class kit's attack
spells, Shaman first. That is all it does now. The Shaman HUD it used to ship
(range finder, swing timer, totems, reminders...) was retired once Forever's
own Cooldown Manager, Swing Timer, Personal Resource Display and Totem Frame
covered most of it: see `docs/research/forever-native-ui.md`; git history
keeps the code. Read `CONTEXT.md` first for the words this repo uses
(Forever, secret value, restriction, probe, class kit, safe layer, attack
macro...).

## Ground rules

- **Bun only.** `bun install`, `bun run`, `bun test`, `bunx`. Never
  npm/yarn/pnpm; their lockfiles are gitignored on purpose.
- **`bun run check` before any PR.** It is what CI runs: `check:all`
  (type-check, ESLint + Prettier, syncpack) and then `lua:all` (StyLua format
  check, LuaLS, the secret-read guard, and `bun test`). ESLint is the
  TypeScript formatter; `bun run lua:format` formats the Lua.
- **A fresh checkout needs `bun run tools:fetch`** (LuaLS, the WoW API
  annotations and Forever's API docs, pinned, into the gitignored `.tools/`).
  `lua:all` runs it first; `bun test` alone needs it for the guard's tests.
- **Add dependencies to the root `workspaces.catalog`**, then reference
  `"catalog:"` from the package. A bare version in a package's `package.json`
  fails `syncpack lint`.
- **`bunfig.toml` blocks packages published in the last 7 days.** A resolution
  failure that reads `blocked by minimum-release-age` is that gate, not a typo.
  Pick the newest release older than a week.
- **kebab-case file names**, except where WoW requires otherwise (the `Turbo`
  addon folder and its TOC).
- **Never read, compare or compute a secret value** in addon code. Never change
  a player's existing UI settings (CVars, Blizzard frames); tell them how
  instead.

## Where things live

| Concern | Where |
| --- | --- |
| The shipped addon (the only folder that gets packaged) | `packages/addon/Turbo/` |
| Dev-only addon files (type stubs, tests, scripts, tool configs) | `packages/addon/` outside `Turbo/` |
| The safe layer (the only code that touches the game) | `packages/addon/Turbo/core/safe-layer.lua` |
| Startup (the Forever-only and class checks) and `/turbo` | `packages/addon/Turbo/core/start.lua`, `core/slash.lua` |
| Attack macros | `packages/addon/Turbo/core/attack-macros.lua` |
| Class kits (one per supported class) | `packages/addon/Turbo/kits/` |
| The fake game and test harness | `packages/addon/tests/fake-game/` |
| Dev scripts (tool fetch, LuaLS, secret-read guard) | `packages/addon/scripts/` |
| The Turbo site | `packages/web/` |
| The probe (dev tool, never released; raw results gitignored) | `tools/probe/` |
| Glossary | `CONTEXT.md` |
| Research (Forever's native UI vs the retired HUD) | `docs/research/` |

## Lua tooling and tests

- **LuaLS** (`bun run lua:check`) lints and type-checks `packages/addon` with
  `.luarc.json` there: Ketho's WoW annotations plus our stubs in `types/`.
  `types/forever.lua` covers Forever-only APIs the annotations lack; add to it
  from Forever's own API docs (`.tools/forever-api/...`) when Turbo needs one.
- **The safe layer is the seam.** `Turbo/core/safe-layer.lua` is the only file
  that touches the game. Its contract is `types/safe-layer.lua`; the fake game
  (`tests/fake-game/`) implements the same contract, and a test fails if the
  two stop offering the same functions. A new game read is a named reading in
  the safe layer, scripted in tests with `game.setReading(...)`.
- **The secret-read guard** (`bun run lua:guard`) reads Forever's API docs and
  fails any secret-returning game call, or `_G`, outside the safe layer.
- **Tests** (`bun test`) load the real `Turbo_Camelot.toc` files into Lua 5.1
  (WebAssembly) with `loadTurbo()` from `tests/fake-game/fake-game.ts`, drive
  it with events, readings and typed slash commands, and assert on what the
  player sees: chat lines, macros, action slots and the cursor. Secret stand-ins
  (`game.secret('mana')`) fail loudly when read, compared, used in math,
  concatenated, stringified or kept as a table key. One thing the fake can't
  see: `secret == plainValue` is silently false in Lua 5.1 (no metamethod
  runs), so equality against a plain value is left to review and the in-game
  checklist.
- **Turbo keeps no saved data**: the TOC has no `SavedVariables`. Add one
  only when a feature needs it.

## Releases

Every PR into `main` must carry a changeset (`bun run changeset`);
`require-changesets.yml` fails the PR without one. Repo and tooling changes use
a `patch` on the package they serve. Nothing is published to npm: both packages
are `"private": true`.

Merging the changesets Version PR is the only release step: it tags
`v<addon version>` and the BigWigs packager publishes the addon folder. See
`.changeset/README.md`. Never tag or upload by hand.

## Agent skills

### Issue tracker

GitHub Issues on `asibilia/range-finder--classic`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

### Memory

Prior findings (the 2023 audit, Forever API research, every probe round) live
in the MuninnDB vault named in `.luca/config.json` (`rangefinder-classic`).
Recall it before starting a ticket.
