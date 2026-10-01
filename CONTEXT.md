# Turbo

An opinionated class helper addon for WoW: Forever. It started as a Classic hunter range finder called RangeFinder Classic and is being rebuilt to give each class one HUD with the things that class needs, Shaman first.

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
A game value the engine hides from addon code. The addon can hold it and hand it to a Blizzard display widget, but cannot read, compare, or do math with it.
_Avoid_: Hidden value, locked value, protected value

**Restriction**:
A game state (combat, a dungeon map, a boss encounter, and so on) during which certain values become secret values.
_Avoid_: Lockdown, combat lockdown (those mean blocked protected actions, a different rule)

**Display-only**:
A feature that puts a secret value on screen through a Blizzard widget without the addon ever reading it.
_Avoid_: Show-only, pass-through

**Self-timed**:
A timer the addon runs on its own clock, started from plain events such as a totem cast, instead of reading the game's secret timer.
_Avoid_: Estimated, predicted, guessed

**Resync**:
Correcting a self-timed timer or a counted value against the real game value once it is readable again, usually right after leaving combat.
_Avoid_: Refresh, reset, sync

**Probe**:
The throwaway diagnostic addon that records which values are readable and which are secret in the beta client. It is separate from Turbo and never released.
_Avoid_: Test addon, debug addon

**Dev build**:
An unreleased copy of Turbo loaded straight from the repo into the beta client for testing.
_Avoid_: Test build, local build

**Debug mode**:
Turbo's own built-in logging of which values are readable or secret, switched on by the player. A mini probe inside the released addon.
_Avoid_: Probe (that is the separate diagnostic addon), verbose mode

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

**Class helper**:
The addon itself: one HUD per class that bundles what that class needs, such as range, swing timer, and totem timers.
_Avoid_: WeakAura pack, rotation addon, range finder (that is now one feature, not the whole addon)

**HUD**:
The on-screen group of Turbo's displays for the player's class.
_Avoid_: Frame, UI, overlay

**Module**:
One self-contained feature of Turbo, such as totem timers or the range finder, that can be turned on or off on its own.
_Avoid_: Feature (fine in conversation, but the unit is a module), plugin, widget

**Class kit**:
The list of modules Turbo turns on for one class, and the attack spells it makes attack macros for. Adding a class means writing its class kit and any modules it needs.
_Avoid_: Class bundle, profile, loadout

**Attack macro**:
A per-character macro Turbo makes for one of the class kit's attack spells when the player types `/turbo macros`. It starts auto-attack and casts the spell's top rank, and Turbo swaps it onto the action bars wherever that spell sat.
_Avoid_: Startattack macro, cast macro

**Engaged**:
The player is in combat or has an attackable enemy targeted. The HUD shows while engaged and fades away otherwise.
_Avoid_: Active, in combat (engaged also covers having a target out of combat)

**Reminder**:
A warning that a self-buff or weapon imbue the player should have is missing or about to run out.
_Avoid_: Alert, nag, warning

**Range band**:
The range finder's answer for the current enemy target: Melee, Shock range, Bolt range, or Out of range.
_Avoid_: Distance, range (on its own), yards

### Shaman

**Totem slot**:
One of the four element spots (Earth, Fire, Water, Air) that each hold at most one of the player's totems at a time. Dropping a new totem of the same element replaces the old one.
_Avoid_: Totem bar, totem element, totem

### Melee timing

**Clip**:
Losing melee swing progress because a cast restarted the swing timer.
_Avoid_: Swing reset (that is the mechanic; clip is the loss), pushback (that is damage slowing your own cast)

**Safe window**:
The short stretch right after a melee swing lands, when a hard cast costs little or no swing time.
_Avoid_: Weave window, cast zone

**Hard cast**:
A spell with a cast time, such as Lightning Bolt or a heal, as opposed to an instant spell like a shock.
_Avoid_: Cast (on its own), channel
