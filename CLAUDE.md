Read `AGENTS.md` first: it is this repo's agent guide. `CONTEXT.md` has the
domain words.

- Bun only (`bun install`, `bun run`, `bun test`, `bunx`), never npm.
- Before a PR: `bun run check` (what CI runs), and add a changeset
  (`bun run changeset`). A fresh checkout needs `bun run tools:fetch` first.
- Only `packages/addon/Turbo/` ships. Dev-only files stay outside it.
- Never read, compare or compute a secret value in addon code.
