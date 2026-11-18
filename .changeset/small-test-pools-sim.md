---
'@goturbo/sim': patch
---

The sim's tests make small pools: every `createSimPool(` call in the tests
passes a `size` (2, or the size the test is about), and a scan test,
`poolSizeProblems` in `tests/test-pools.test.ts`, fails any call in the
armory's or the sim's tests without a size of 3 or less.
