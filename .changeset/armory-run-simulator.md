---
'@goturbo/armory': minor
---

Enable `Run Simulator` by default whenever an export is loaded (dropped `.lua` or
dev `localLatest` with `/local/latest-export.lua`) and remove the coming-soon
gate. Keep `Run Simulator` disabled with `Bring in your export to run the sim
here.` when only a results file is open (sample, `.json`, or remembered in
`localStorage`), and keep `chain-solo` selected when re-simming with an updated
time between pulls.
