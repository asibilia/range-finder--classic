# Turbo

**Spell macros for WoW: Forever.**

Turbo is a small addon for WoW: Forever, made by the Turbo crew. Type
`/turbo macros` (or `/tb macros`) and it makes a macro for every spell on your
bars that has more than one rank, for any class, and swaps it onto your bars
wherever that spell sat. Each casts the top rank, so learning a new rank needs
no new button. An attacking spell's macro also starts auto-attack
(`/startattack`), except crowd control that damage breaks (Gouge, Polymorph,
Sap...). It reuses its own macros, and uses general macro slots once your
character's are full.

Turbo used to be an Enhancement Shaman HUD. Forever's own UI now covers most
of it: use the Cooldown Manager, Swing Timer, Personal Resource Display and
Totem Frame instead. `docs/research/forever-native-ui.md` compares them with
the old HUD, and git history keeps its code.

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
