---
'@goturbo/armory': patch
---

`test:armory` gives each test 2 seconds (`--timeout=2000`) and skips the
`*.slow.test.ts` files, which run through the root `test:slow`. The
package's `test` script calls the root `test:armory`.
