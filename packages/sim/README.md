# @goturbo/sim

The **browser sim**: the gear sim, WoWSims Forever, built to WebAssembly so
the armory planner can sim a character on the player's own computer.

## What's here

- `upstream/`: WoWSims Forever (Go, MIT), vendored verbatim from
  https://github.com/wowsims/forever at commit
  `47205c966132ef52b5d12cef97dac6ebe017190c`. `UPSTREAM.md` lists the parts,
  what differs from upstream (the generated protobuf Go, our own
  `sim/wasm/turbo_*.go`) and how to move the pin. The level-aware patch
  sits on top as its own commits: level as a setting, spell ranks by level,
  a level profile (base stats, health, mana and attack power, crit and dodge
  per point, known spells), `starting_mana_percent`, level gaps up to +10
  and a per-second timeline. The profile travels with each call
  (`core.SetLevelProfile`), and the level-60 tables come back after it.
- `upstream/sim/wasm/turbo_*.go`: our three WASM exports, each one JSON
  string in and one out: `turboSim({ request, level_profile? })` (a
  `RaidSimRequest`, parsed strictly), `turboSheet({ request,
  level_profile? })` (`{ level, unreached_ranks, player }`) and
  `turboVersion()` (`{ upstream_commit, patch_id, go_version }`). A failure
  answers `{ "error": "<message>" }`.
- `src/`: the TypeScript side. `loadSim({ base })` loads the sim from
  `base` (`/sim/` on the page, a `file://` URL of `build/` under Bun) and
  offers `sim(request, profile?)`, `sheet(request, profile?)` and
  `version()`; an `{ error }` answer throws a `SimError`. `loader.ts` is the
  only module that fetches. And the leak guard (`scanForLeaks`).
- `scripts/`: `build.ts` (`sim:build`), `go-check.ts` (`sim:go`) and
  `add-fixture.ts` (`sim:add-fixture`).
- `fixtures/`: test inputs under neutral names, such as upstream's level-60
  test request and its expected DPS.

## Scripts

Each also runs from the repo root. Go (the version in `upstream/go.mod`)
must be installed.

| Script | What it does |
| --- | --- |
| `bun run sim:build` | Builds `upstream/sim/wasm` to WASM with `-tags with_db`, gzipped, into the git-ignored `build/` (`lib.wasm.gz`), with Go's own `wasm_exec.js`, the item data JSON and `version.json` (its `patch_id` is also compiled in) |
| `bun run sim:go` | `gofmt -l` over our own Go, `go vet ./sim/wasm/...`, and `go test -tags with_db` of the patched packages (`sim/core/spelldata`, `sim/shaman`) |
| `bun run sim:test` | The package's tests (they build the sim when they need it) |
| `bun run type-check:sim` | `tsc -b` on this package's composite `tsconfig.json` |
| `bun run sim:add-fixture <export> <name>` | Adds an export as a fixture (see below) |

## The leak guard

Technical details of the owner's computer must never get into the repo:
home paths, the game's install and SavedVariables folders, temporary
folders, `Config.wtf`, the computer's user and host names. Other players'
GUIDs must not either. The owner's own character data may. A test scans
this package (upstream and fixtures included), its build and the armory's
browser-sim code with `scanForLeaks`. Put words the test can't read itself
(the game account name, another machine's names) in the git-ignored
`.machine-words`, one per line. Innocent upstream matches go in
`leak-allow.txt` with a reason.

`sim:add-fixture` copies an export's contents (never its path) under a
`truncha-*.lua` name, replaces other players' names and GUIDs with
`Player1`, `Player-0-00000001` and so on, writes `fixtures/owner.json`, and
runs the leak guard on the new file.

## Licence and credit

`upstream/LICENSE` is upstream's MIT licence, unchanged ("Copyright (c) 2022
wowsims team"). Our changes keep its MIT terms. The item, spell and enchant
data in `upstream/assets/database/` is extracted from World of Warcraft's
game files by WoWSims's tools: it is Blizzard's, not MIT, shipped exactly as
WoWSims ships it, and not claimed as ours.

The page credits it in plain text:

> Sim: WoWSims Forever (MIT), changed to sim levels below 60. Item and spell
> data: World of Warcraft game data, as WoWSims packages it.
