# @goturbo/web

## 0.0.1-beta.0

### Patch Changes

- [#42](https://github.com/asibilia/range-finder--classic/pull/42) [`ad5b49a`](https://github.com/asibilia/range-finder--classic/commit/ad5b49ab75fbf182ece551e4e1afd726b75bc3db) Thanks [@asibilia](https://github.com/asibilia)! - Reboot the repo as Turbo's Bun monorepo ([#24](https://github.com/asibilia/range-finder--classic/issues/24)). The 2023 RangeFinder Classic addon, its packaging config, binary lockfile, tsconfig, changesets and `dev-tools` release scripts are gone from `main`; the code is kept under the tag `legacy/rangefinder-classic-v0.2.0`. The repo now has Bun workspaces with `@goturbo/addon` and `@goturbo/web`, a text lockfile, TMNB's supply-chain install settings, ESLint 9 + Prettier, per-package tsconfig, the conventional-commit helper, changesets (required on PRs) and syncpack with a version catalog. CI runs lint, type-check and syncpack on pull requests and `main`. The glossary, the MuninnDB vault config, the agent guides and the probe (code only) are committed.
