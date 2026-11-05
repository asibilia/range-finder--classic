# cdm-layout

Dev-only. Builds Turbo's **Cooldown Manager layout import string** for WoW:
Forever (Shaman). Never shipped; nothing here goes in `packages/addon/Turbo/`.

```sh
bun tools/cdm-layout/build.ts   # prints the string
bun test tools/cdm-layout       # round-trips the owner's sample and checks the layout
```

In game: `/cdm` → layout dropdown → **Import**, paste the string, and give the
layout a name. The import dialog always blanks the name in the string and asks
for one.

## The layout

| Section | Contents, in order |
| --- | --- |
| Essential Cooldowns | Stormstrike, Earth Shock, Chain Lightning |
| Utility Cooldowns | Strength of Earth Totem, Searing Totem, Mana Spring Totem, Windfury Totem |
| Tracked Buffs | Lightning Shield, Flurry |
| Tracked Bars | nothing |
| Not Displayed | every other Shaman entry |

There's one alert: on the Lightning Shield buff, **Sound**, **On Aura Removed**,
**Text to Speech**, stored as `{1, 6, 0}`.

## Format

From `Blizzard_CooldownViewer` in
[Gethe/wow-ui-source@eac30af](https://github.com/Gethe/wow-ui-source/tree/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer)
(Forever 1.60.1.70790): `CooldownViewerSettingsDataStoreSerialization.lua`,
`CooldownViewerSettingsLayoutManager.lua`,
`CooldownViewerSettingsDataProvider.lua`, `CooldownViewerAlert.lua`,
`CooldownViewerSettingsAlerts.lua`, `CooldownViewerUtil.lua` and
`Blizzard_APIDocumentationGenerated/CooldownViewerConstantsDocumentation.lua`.

- **String:** `1|` + base64(raw DEFLATE(CBOR(table))). It's raw deflate, not
  zlib. `Bun.deflateSync` re-encodes the owner's sample byte for byte.
- **CBOR:** a Lua table with keys 1..n (or no keys) is written as an array, and
  any other table as a map with integer keys. Strings are **byte strings**
  (major type 2).
- **Table (save format 5):**
  - `[1]` = 5.
  - `[2]` = the active layout per spec. An export leaves this empty.
  - `[3]` = `{ [specTag] = { [layoutID] = layout } }`. The spec tag is
    `classID * 10 + specIndex`, so Shaman is `71`.
  - `[4]` = `{ [layoutID] = name }`. The import needs it, because the reader
    looks up `[4][layoutID]`.
- **Layout:**
  - `[1]` is one ordered list of cooldownIDs. Each section shows its own IDs
    in this order. The game drops unknown IDs and adds any missing ones at
    the end.
  - `[2]` = `{ [category] = {cooldownIDs} }`. Essential 0, Utility 1, Tracked
    Buff 2, Tracked Bar 3. Not Displayed is -1 for spells and -2 for auras.
  - `[3]` = `{ [cooldownID] = { {type, event, payload}, ... } }`. Type: Sound
    1, Visual 2. Event: On Aura Removed 6. Sound payload: Text to Speech 0.

The owner's sample, `1|a2FtWCjh3tjQ6BdSVJqXnJGo4ASmAA==`, decodes to
`[5, [], {71: [[]]}, ["Truncha Buncha"]]`. That's one empty Shaman layout,
ID 1, named "Truncha Buncha". The 4th field is the layout name, not the
character's name. This generator writes "Turbo" there.

Unlike the game's exporter, this generator gives **every** entry an explicit
category, including entries that keep their default. The reader accepts that,
and it means a hotfix to a default can't move one of Turbo's entries.

## IDs

A cooldownID is the row ID in the client's `CooldownSetSpell` table. Shaman is
spec 1489, which uses `CooldownSet` 5263. Names come from `SpellName`. The data
is copied into `shaman-cooldowns.ts`. To pull it again for a new build:

```sh
B=1.60.1.70790
for t in CooldownSet CooldownSetSpell SpellName; do
  curl -sSL -o "$t.csv" "https://wago.tools/db2/$t/csv?build=$B"
done
awk -F, '$2==5263' CooldownSetSpell.csv
```

Sources, build 1.60.1.70790:

- https://wago.tools/db2/CooldownSet/csv?build=1.60.1.70790
- https://wago.tools/db2/CooldownSetSpell/csv?build=1.60.1.70790
- https://wago.tools/db2/SpellName/csv?build=1.60.1.70790

Notes:

- `SpellName` has no row for spell 52127, the unnamed Utility entry.
- Group-buff rows (category 4) aren't part of the ordered list, so they're left
  out.
- Item and trinket entries come from other sets. The game adds them to the end
  of the list in their default sections.

**Not yet verified in game:** that the import is accepted and shows this layout.
