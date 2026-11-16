---
'@goturbo/armory': minor
---

Remember the last results file in this browser, so a reload doesn't start
empty. The page keeps the text of the last file picked or dropped that read OK
in `localStorage` under one key, `armory:last-results-file` (never the bundled
sample), reads it back through the same checks on load, and forgets it with a
note if it no longer reads. `Forget this file` in the footer clears it. When
storage is unavailable or full the page works as before, without remembering.
Nothing else is stored and nothing is sent anywhere.
