---
'@goturbo/armory': patch
---

The armory's real-sim tests make pools of 2 workers, not the default (the
computer's cores minus one, up to 8), so a test file no longer loads the
sim up to eight times over.
