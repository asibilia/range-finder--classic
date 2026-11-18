---
'@goturbo/sim': patch
---

The sim's tests split into fast and slow files. The ones that run the real
WASM, build it or run Go (`pool`, `sim-api`, `wasm-build`, `go-checks` and
half of `weights`) are now `*.slow.test.ts`; the fast files give no test a
time limit above 2 seconds. A guard, `findSlowInFast` in
`tests/slow-split.test.ts`, fails a fast test file that runs the WASM or
sets a longer limit. `sim-api` no longer forces a rebuild: only
`wasm-build` does.
