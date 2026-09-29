# Turbo — agent guide

Turbo is an opinionated class helper addon for **WoW: Forever**, made by the
Turbo crew. v1 is the Enhancement Shaman HUD. Read `CONTEXT.md` first for the
words this repo uses (Forever, secret value, restriction, display-only,
self-timed, resync, probe, module, class kit, safe layer...). The plan is the
spec, issue #23; the decisions behind it are the closed tickets linked from the
map, issue #3.

## Ground rules

- **Bun only.** `bun install`, `bun run`, `bun test`, `bunx`. Never
  npm/yarn/pnpm; their lockfiles are gitignored on purpose.
- **`bun run check:all` before any PR.** It runs type-check, lint and syncpack.
  Lint is the TypeScript formatter here (ESLint + Prettier); there is no
  separate prettier step.
- **Add dependencies to the root `workspaces.catalog`**, then reference
  `"catalog:"` from the package. A bare version in a package's `package.json`
  fails `syncpack lint`.
- **`bunfig.toml` blocks packages published in the last 7 days.** A resolution
  failure that reads `blocked by minimum-release-age` is that gate, not a typo.
  Pick the newest release older than a week.
- **kebab-case file names**, except where WoW requires otherwise (the `Turbo`
  addon folder and its TOC).
- **Never read, compare or compute a secret value** in addon code. Never change
  a player's existing UI settings (CVars, Blizzard frames); tell them how
  instead.

## Where things live

| Concern | Where |
| --- | --- |
| The shipped addon (the only folder that gets packaged) | `packages/addon/Turbo/` |
| Dev-only addon files (type stubs, tests, scripts, tool configs) | `packages/addon/` outside `Turbo/` |
| The Turbo site | `packages/web/` |
| The probe (dev tool, never released; raw results gitignored) | `tools/probe/` |
| Glossary | `CONTEXT.md` |

## Releases

Every PR into `main` must carry a changeset (`bun run changeset`);
`require-changesets.yml` fails the PR without one. Repo and tooling changes use
a `patch` on the package they serve. Nothing is published to npm: both packages
are `"private": true`.

## Agent skills

### Issue tracker

GitHub Issues on `asibilia/range-finder--classic`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

### Memory

Prior findings (the 2023 audit, Forever API research, every probe round) live
in the MuninnDB vault named in `.luca/config.json` (`rangefinder-classic`).
Recall it before starting a ticket.
