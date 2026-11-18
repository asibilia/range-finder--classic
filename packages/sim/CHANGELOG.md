# @goturbo/sim

## 0.1.0-beta.0

### Minor Changes

- [#86](https://github.com/asibilia/range-finder--classic/pull/86) [`3ed1d60`](https://github.com/asibilia/range-finder--classic/commit/3ed1d606f6ba8367b231a5409df66655bd04fe4d) Thanks [@asibilia](https://github.com/asibilia)! - Spec: armory planner, slice B (the sim runs in the browser) ([#73](https://github.com/asibilia/range-finder--classic/issues/73))

### Patch Changes

- [#108](https://github.com/asibilia/range-finder--classic/pull/108) [`0cb5e2e`](https://github.com/asibilia/range-finder--classic/commit/0cb5e2ee432a8afb4b1158de58ffe64447cb96ca) Thanks [@asibilia](https://github.com/asibilia)! - Spec: the armory opens on the owner's latest results file (dev only) ([#105](https://github.com/asibilia/range-finder--classic/issues/105))

- [#86](https://github.com/asibilia/range-finder--classic/pull/86) [`3ed1d60`](https://github.com/asibilia/range-finder--classic/commit/3ed1d606f6ba8367b231a5409df66655bd04fe4d) Thanks [@asibilia](https://github.com/asibilia)! - Spec: armory planner, slice B fixes before merge ([#88](https://github.com/asibilia/range-finder--classic/issues/88))

- [#126](https://github.com/asibilia/range-finder--classic/pull/126) [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356) Thanks [@asibilia](https://github.com/asibilia)! - The sim's tests split into fast and slow files. The ones that run the real
  WASM, build it or run Go (`pool`, `sim-api`, `wasm-build`, `go-checks` and
  half of `weights`) are now `*.slow.test.ts`; the fast files give no test a
  time limit above 2 seconds. A guard, `findSlowInFast` in
  `tests/slow-split.test.ts`, fails a fast test file that runs the WASM or
  sets a longer limit. `sim-api` no longer forces a rebuild: only
  `wasm-build` does.

- [#126](https://github.com/asibilia/range-finder--classic/pull/126) [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356) Thanks [@asibilia](https://github.com/asibilia)! - The sim's tests make small pools: every `createSimPool(` call in the tests
  passes a `size` (2, or the size the test is about), and a scan test,
  `poolSizeProblems` in `tests/test-pools.test.ts`, fails any call in the
  armory's or the sim's tests without a size of 3 or less.

- [#126](https://github.com/asibilia/range-finder--classic/pull/126) [`6b81061`](https://github.com/asibilia/range-finder--classic/commit/6b8106170a08310acfda2dee3adbfb1377db9356) Thanks [@asibilia](https://github.com/asibilia)! - The test limits are committed. `bunfig.toml` ignores `*.slow.test.ts`, so
  `bun test --isolate` runs only the fast tests; the new root `test:slow`
  runs the slow ones, and `check:all` runs it right after `test:armory`.
  `sim:test` gives each test 2 seconds (`--timeout=2000`), and the package's
  `sim:test` calls the root one. Luca's config sets the same 2-second limit,
  a 15-minute test gate, one test run and one prepare at a time, and a
  `checks.slow_test` for the slow files. `checkTestLimits` in
  `tests/repo-setup.test.ts` holds these values.
