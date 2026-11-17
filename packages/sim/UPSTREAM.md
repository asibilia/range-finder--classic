# The vendored upstream

`upstream/` holds the parts of WoWSims Forever the WASM build needs, copied
verbatim at the pin, with two layers on top: the level-aware patch and our
own Go (both listed below). Bugs in those layers are ours to fix in place.
ESLint, Prettier, tsc and `bun test` skip `upstream/`; `bun run sim:go`
checks our Go (`gofmt`, `go vet`, the patched packages' tests).

| | |
| --- | --- |
| URL | https://github.com/wowsims/forever |
| Commit | `47205c966132ef52b5d12cef97dac6ebe017190c` |
| Copied | 2026-11-15 |
| Parts | `go.mod`, `go.sum`, `LICENSE`, `sim/`, `proto/`, `assets/database/`, `ui/sim/talents/trees/` |
| `protoc` | 28.3 |
| `protoc-gen-go` | v1.36.12 |

## What differs from upstream at the pin

- **Dropped:** `sim/core/proto/.gitignore`, which ignores the generated Go.
- **Added:** the generated protobuf Go, `sim/core/proto/*.pb.go` (upstream
  ignores them), made with the `protoc` and `protoc-gen-go` above, so the
  build and CI need no `protoc`.
- **Added, ours:** `sim/wasm/turbo_*.go`, new files beside upstream's WASM
  entry point (`turbo_ready.go` gives hosts other than upstream's site a
  do-nothing `wasmready`; `turbo_exports.go` registers `turboSim`,
  `turboSheet` and `turboVersion`). Upstream's `main.go` is never edited.

The level-aware patch comes on top, as its own commits (`47205c9..62129e9`
of the owner's sim branch, `sim/` and `proto/` only). On top of it, ours:
the level profile travels with each call instead of being read once at
start-up. `core.SetLevelProfile` applies one and puts the level-60 tables
back with `nil`; hooks (`core.OnLevelChange`) re-pick the shaman's ranks
(`sim/shaman/level_ranks.go`) and restart the unreached-ranks list at each
change. Only the shaman's ranks follow the profile: other classes keep their
level-60 ranks.

Our per-call profile changes, on top of the patch:

- `sim/core/level_profile.go` (reworked: `SetLevelProfile`,
  `OnLevelChange`, no environment variable or file read),
  `sim/core/base_stats.go` and `sim/core/spelldata/ladder.go`
- `sim/shaman/level_ranks.go` (new) and the shaman's rank hooks in
  `chain_lightning.go`, `fire_totems.go`, `lightning_bolt.go`, `shields.go`,
  `shocks.go`, `stormstrike.go`, `talents_elemental.go`,
  `talents_enhancement.go`, `talents_restoration.go`, `totems.go` and
  `weapon_imbues.go`
- the tests `sim/shaman/level_60_test.go` (new) and
  `sim/shaman/level_aware_test.go` (changed)
- `sim/wasm/turbo_*.go` (above)

`git log -- packages/sim/upstream` shows each layer's commits.

Check that nothing else is needed with:

```sh
cd packages/sim/upstream
GOOS=js GOARCH=wasm go list -deps -tags with_db ./sim/wasm
```

## Upstream's Go tests

Most of upstream's Go tests load gear sets, APLs and builds from
`ui/specs/` (and a few read other `ui/` files or import `ui/worker`), which
aren't vendored. CI's `sim-go-test` job therefore runs
`go test -tags with_db` only on the packages whose tests read nothing but
the vendored parts: `sim/shaman` (not its specs), `sim/common/...`,
`sim/encounters/...` and `sim/core/{spelldata,stats,dbcenums,bulk,buffs}/...`.
The class and spec packages (Enhancement included) and `sim/core` itself
aren't tested there. Vendoring `ui/specs/` and the other `ui/` files they
read would close the gap.

## Moving the pin

1. Copy the parts above from the new upstream commit over `upstream/`,
   verbatim, keeping our `sim/wasm/turbo_*.go`, and drop
   `sim/core/proto/.gitignore` again.
2. Regenerate `sim/core/proto/*.pb.go` from `proto/` with the pinned
   `protoc` and `protoc-gen-go` (or pin newer ones, and update this file).
3. Update the commit and date in the table above, and the commit in
   `README.md`. The table's Commit row is the commit's one place in the
   code: `sim:build` reads it from there into `build/version.json` and
   compiles it into the module (`-X main.upstreamCommit`), so
   `turboVersion()` names it. The Go version in CI follows
   `upstream/go.mod`.
4. Re-apply the level-aware patch, then our per-call profile changes on top
   of it (the files listed above: take them from
   `git diff <the patch commit> HEAD -- packages/sim/upstream` before the
   copy). Keeping only `sim/wasm/turbo_*.go` loses the per-call profile.
5. Run `bun run sim:build`, `bun run sim:go` and `bun run sim:test`, and
   add any innocent new leak guard matches to `leak-allow.txt` with a
   reason.
6. Run `bun run sim:weights`: each weights file names the commit and patch
   id it was simmed on, and a test fails until they match the build. The
   tests pinning upstream's commit (`tests/sim-api.test.ts`,
   `tests/weights.test.ts`) name it too: update them with it.
