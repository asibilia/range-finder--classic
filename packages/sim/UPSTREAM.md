# The vendored upstream

`upstream/` holds the parts of WoWSims Forever the WASM build needs, copied
verbatim.

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
  do-nothing `wasmready`). Upstream's own files are never edited.

The level-aware patch comes on top, as its own commits.

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
3. Update the commit and date here, and the Go version in CI follows
   `upstream/go.mod`.
4. Re-apply the level-aware patch, run `bun run sim:build`,
   `bun run sim:go` and `bun run sim:test`, and add any innocent new leak
   guard matches to `leak-allow.txt` with a reason.
