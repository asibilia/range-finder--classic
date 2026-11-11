# Turbo

A small addon for WoW: Forever that makes spell macros (`/turbo macros`) for every class. It started as a Classic hunter range finder called RangeFinder Classic, then became a Shaman HUD; once Forever launched with its own Cooldown Manager, Swing Timer, Personal Resource Display and Totem Frame, Turbo was trimmed to just the macros (see "Retired" below).

## Language

### The game

**Forever**:
WoW: Forever, the permanent level-60 "Classic Plus" game this addon targets. It runs on the modern retail engine, so modern addon rules apply.
_Avoid_: Classic, Classic Plus, Camelot (Blizzard's internal code name; only appears in file names like `_Camelot.toc`)

**Beta client**:
The local WoW: Forever beta install used for in-game testing.
_Avoid_: PTR, test realm

**Beta release**:
A Turbo version published on the stores' beta channel. Turbo ships beta releases until Forever launches, then normal releases.
_Avoid_: "Beta" on its own (it could mean the Forever beta or a Turbo beta release)

### Addon restrictions

**Secret value**:
A game value the engine hides from addon code. The addon can hold it and hand it to a Blizzard display widget, but cannot read, compare, or do math with it. Turbo's safe layer drops any it gets back.
_Avoid_: Hidden value, locked value, protected value

**Restriction**:
A game state (combat, a dungeon map, a boss encounter, and so on) during which certain values become secret values.
_Avoid_: Lockdown, combat lockdown (those mean blocked protected actions, a different rule)

**Probe**:
The throwaway diagnostic addon that records which values are readable and which are secret in the beta client. It is separate from Turbo and never released.
_Avoid_: Test addon, debug addon

**Dev build**:
An unreleased copy of Turbo loaded straight from the repo into the beta client for testing.
_Avoid_: Test build, local build

### The addon

**Turbo**:
The name of the addon. On its own, "Turbo" always means the addon, never the friend group.
_Avoid_: RangeFinder, RangeFinder Classic, Range Finder (Classic) (the retired 2023 name)

**RangeFinder Classic**:
The retired 2023 hunter range-finder addon for Classic Era that Turbo replaces. It shares Turbo's repo history but none of its code.
_Avoid_: Turbo v0, the old Turbo

**Turbo crew**:
The WoW friend group and guild that makes Turbo.
_Avoid_: Turbo (on its own), Turbo team, the guild

**Turbo site**:
The public landing page for Turbo, meant to live at goturbo.gg. It is about the addon, not the crew.
_Avoid_: Crew site, web app, dashboard

**Safe layer**:
The one Turbo file (`core/safe-layer.lua`) that touches the game API. Everything else asks it for named readings and calls; in tests the fake game stands in for it.
_Avoid_: API wrapper, game layer

**Spell macro**:
A macro Turbo makes, when the player types `/turbo macros`, for every spell on their bars that has more than one rank (one with a rank line, "Rank 2"; Ghost Wolf gets none). It is named for the spell (cut to the game's 16-letter macro name limit; the body still casts the full name) and casts its top rank (`#showtooltip`, `/cast <name>`), and Turbo swaps it onto the action bars wherever that spell sat, at any rank. It is a character macro, or a general (account) one once the character's 30 slots are full; a general one is shared by every character.
_Avoid_: Cast macro, rank macro

**Attack macro**:
The spell macro for an attacking spell: it also starts auto-attack (`/startattack`) before the cast. Crowd control that damage breaks (Gouge, Sap, Polymorph...) never gets one: its spell macro is the plain kind.
_Avoid_: Startattack macro

### Retired

Words for the Shaman HUD that Turbo no longer ships: HUD, Class kit, Class helper, Module, Engaged, Debug mode, Display-only, Self-timed, Resync, Reminder, Recall reminder, Range band, Totem slot, Clip, Safe window, Hard cast. Forever's own UI covers most of that HUD; `docs/research/forever-native-ui.md` compares the two, and git history (before the trim to attack macros) keeps the code and the old definitions.
