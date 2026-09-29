# Turbo

**Never clip a swing again. The Enhancement HUD for WoW: Forever.**

Turbo is an opinionated class helper addon for WoW: Forever, made by the Turbo
crew. v1 is Shaman only, Enhancement first: one compact HUD card with your
range band, swing timer and safe window, totems, imbue, Lightning Shield,
cooldowns and mana.

This repo was RangeFinder Classic, a 2023 hunter range finder for WoW Classic.
That addon is retired; its last code is at the tag
`legacy/rangefinder-classic-v0.2.0`.

## Layout

- `packages/addon` (`@goturbo/addon`): the addon. Only `Turbo/` ships.
- `packages/web` (`@goturbo/web`): the Turbo site.
- `tools/probe`: the probe, a diagnostic addon for the Forever beta client.

## Development

```bash
bun install
bun run tools:fetch   # LuaLS, WoW API annotations, Forever API docs (.tools/)
bun run check         # everything CI runs: TS checks, then the Lua checks and tests
bun test              # the tests alone
```

See `AGENTS.md` for the ground rules and `CONTEXT.md` for the vocabulary.
