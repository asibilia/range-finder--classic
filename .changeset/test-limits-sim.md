---
'@goturbo/sim': patch
---

The test limits are committed. `bunfig.toml` ignores `*.slow.test.ts`, so
`bun test --isolate` runs only the fast tests; the new root `test:slow`
runs the slow ones, and `check:all` runs it right after `test:armory`.
`sim:test` gives each test 2 seconds (`--timeout=2000`), and the package's
`sim:test` calls the root one. Luca's config sets the same 2-second limit,
a 15-minute test gate, one test run and one prepare at a time, and a
`checks.slow_test` for the slow files. `checkTestLimits` in
`tests/repo-setup.test.ts` holds these values.
