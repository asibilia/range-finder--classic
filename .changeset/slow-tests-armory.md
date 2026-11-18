---
'@goturbo/armory': patch
---

The armory's tests split into fast and slow files. The ones that run the
real WASM sim or a production build (`browser-sim`, `build-output`,
`vite-plugin-sim`, `vite-plugin-latest`, and half of `sim-export`,
`export-reader` and `unknown-items`) are now `*.slow.test.ts`; the fast
files give no test a time limit above 2 seconds. The Pawn dialog's Copy
test runs on fake timers instead of waiting 2.6 real seconds.
