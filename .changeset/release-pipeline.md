---
'@goturbo/addon': patch
---

Release pipeline (#37) and the dev link. Changesets runs in beta pre-release mode with a Version PR workflow; merging it bumps the addon version and changelog, a workflow step tags `v<version>`, and the tag runs the BigWigs packager, which publishes the zip as a GitHub pre-release and uploads to CurseForge and Wago once their ids and tokens are set. The newest changelog entry becomes the release notes, and CI fails if the packaged zip holds anything outside the `Turbo` folder. `bun run dev:link` links the shipped addon folder into the beta client's AddOns folder, and `bun run dev:watch` is a copy-on-save watcher for clients that don't follow the link.
