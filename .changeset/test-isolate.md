---
'@goturbo/addon': patch
---

Tests run with `bun test --isolate` (the root `test` and `lua:test` scripts, and Luca's test command), so each test file gets a fresh global object. Luca also counts `.test.tsx` files as tests.
