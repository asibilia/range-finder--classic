# rf-probe

Throwaway diagnostic addon for the WoW: Forever beta client (build 1.60.1.70009, `## Interface: 16001`).
It records which APIs and values an addon can read, and which come back secret, in and out of combat.
It never registers the combat log, never stores a secret value, and wraps every game call in `pcall`.

## Install

```bash
bun tools/probe/install.ts
```

This replaces `/Applications/World of Warcraft/_classic_beta_/Interface/AddOns/rf-probe/` with the `.toc`
and `.lua` files from this folder. Both `rf-probe.toc` and `rf-probe_Camelot.toc` ship, because the Forever
client's game type is `camelot` (SealTimersForever and AtlasLoot use the same suffix).

## Use

1. Fully restart the beta client, then make sure **RF Probe** is ticked in the AddOns list at character select.
2. Log in and wait about 3 seconds. The `login` snapshot is taken silently.
3. Optional: `/rfprobe visual` shows the display-only test frame (see the round 4 section).
4. Target a mob and fight it. Snapshots are taken silently (the chat stays quiet).
5. `/reload` (or log out). WoW only writes SavedVariables then.

Output: `WTF/Account/<account>/SavedVariables/rf-probe.lua` (global `RFProbeDB`).

## Commands

| Command | Effect |
|---|---|
| `/rfprobe [label]` | Manual snapshot (label defaults to `manual`) |
| `/rfprobe add <spellID>` | Probe this spell in every snapshot (persists in `extraIDs`) |
| `/rfprobe visual` | Toggle the visual test frame |
| `/rfprobe status` | Four lines of counts (samples, timeline, shock samples, `/tb` result, widget results) |
| `/rfprobe clear` | Drop snapshots, events, samples, counters, error logs. Keeps `extraIDs`, `seenAuraIDs`, `spellNames`, `observedCooldowns` |

## What is in `RFProbeDB`

- `snapshots` (cap 30): `meta`, `restrictions`, `spells`, `auras`, `totems`, `weapon`, `resources`, `range`,
  `cooldownManager`, `sectionErrors`, `secretsSeen`. The first snapshot of a session also has `apis`
  (existence map plus widget-method checks), which is also kept at top level in `apis`.
- `events` (ring, cap 800), `eventCounts` (total, in combat, dropped by the per-fight cap), `eventRegistration`.
- `visualStats` (per-step ok/fail counts, in and out of combat, and which reads were secret), `visualErrors` (cap 50).
- `seenAuraIDs`, `extraIDs`, `spellNames`, `observedCooldowns`, `rangeCheckEnable`, `internalErrors`.
- `legend` explains the value encodings: `"<secret>"`, `"<nil>"`, the `safeCall` shape, and the compact form used in
  the bulky sections.

## Round 2 (probe 0.2.0, `probeVersion = 2`)

Round 1 results are archived (gitignored) in `results/round-1.lua` (raw SavedVariables) and `results/round-1.json`.
The first load of 0.2.0 wipes snapshots, events, visual stats, event counts and error logs (keeps
`seenAuraIDs`, `extraIDs`, `spellNames`, `observedCooldowns`) and sets `probeVersion = 2`, `round = 2`.
No `.toc` changes, so a `/reload` is enough.

New data:

- `totem-<slot>` snapshots: 1.5s after an in-combat `PLAYER_TOTEM_UPDATE` (max 3 per fight, one chat line each).
  The `totems` section includes `GetTotemDuration(slot)` (object, `HasSecretValues`, `IsZero`, remaining, total)
  and `C_Secrets.ShouldTotemSlotBeSecret(slot)`. `meta` now has `instanceInfo` and `round`.
- `rangeSamples` (ring, cap 250): every 1s while an attackable target exists, plus on `SPELL_RANGE_CHECK_UPDATE`,
  `PLAYER_SWING_RANGE_UPDATE` and hostile target changes. Keys are explained in `rangeSampleLegend`; repeated
  call errors are aggregated in `quickErrors`.
- Swing range checks are re-armed on every `PLAYER_ENTERING_WORLD` (`rangeCheckHistory`), and the full spell +
  swing set 3s later (`rangeCheckEnable`).
- `castSamples` (cap 60): player cast/channel starts with `UnitCastingInfo`/`UnitChannelInfo` and the
  `UnitCastingDuration`/`UnitChannelDuration` object.
- `lsSamples` (cap 60) + `lsStats`: Lightning Shield charge tracking. The auraInstanceID is read out of combat
  (kept in memory only); `GetAuraApplicationDisplayCount` results go straight into a FontString. An event-based
  counter (3 on cast, minus 1 per proc `SPELL_UPDATE_COOLDOWN`, one per frame) logs every change.
- `restrictionChanges` (cap 100): `ADDON_RESTRICTION_STATE_CHANGED` with enum names, instance and zone.

`/rfprobe visual` adds a totem row (duration-object swirls), a cast bar (`SetTimerDuration`), the LS
display-count text next to the event counter, and an Earth Shock / melee range line.

## Round 4 (probe 0.4.0, `probeVersion = 4`)

For wayfinder task "Probe round 4: level-20 beta checks" ([#22](https://github.com/asibilia/range-finder--classic/issues/22)).
The SavedVariables from before this round are archived (gitignored) in `results/pre-round-4.lua`. The first load of 0.4.0 drops
everything in `RFProbeDB` except `seenAuraIDs`, `extraIDs`, `spellNames` and `observedCooldowns`, and sets
`probeVersion = 4`, `round = 4`. There's a new file (`checks.lua`), so the client must be restarted, not just reloaded.

New data:

- `shockSamples` (ring 80) + `shockLegend`: 0.3 s and 1.5 s after any shock succeeds, every known Earth, Flame and
  Frost Shock rank is sampled: `C_Spell.GetSpellCooldown` (described), its never-secret `isActive`/`isOnGCD` flags,
  plain start/duration/remaining out of combat, and the `GetSpellCooldownDuration` object. `sharedFlags` lists the
  other shock families that are on a real (not GCD) cooldown; it works in combat too.
- `timeline` (ring 800, no per-fight cap): every `PLAYER_SWING` and every player `UNIT_SPELLCAST_*` (START, SUCCEEDED,
  STOP, INTERRUPTED, FAILED, FAILED_QUIET, DELAYED, CHANNEL_START/STOP) with all arguments (castGUID included) and
  `GetTime`, plus auto-attack on/off and combat on/off. These events are no longer copied into `events`.
- `slashTB.login` / `slashTB.logout`: every `SLASH_*` global equal to `/tb`, the `hash_SlashCmdList`,
  `hash_ChatTypeInfoList` (owner key) and `hash_EmoteTokenList` entries for `/TB`, and `IsSecureCmd("/tb")`. The probe
  never registers `/tb` itself.
- `cvars.countdownForCooldowns`: read only, never set.
- Instance type and difficulty (`i = "party:1"`) on every snapshot and sample; `restrictionChanges` also records
  `ShouldAurasBeSecret`. `rangeSamples` now holds 400.
- Auto snapshots: combat start, then 3 more every 4 s, combat end, and up to 3 totem drops per fight (all silent).

`/rfprobe visual` now shows (labels on the left):

| Label | What it tests |
|---|---|
| `mana#` | Mana bar and number fed the raw (secret) values; bar colour, number colour and a `LOW` tag driven by Step curves through `UnitPowerPercent`. Red under 20%. Purple would mean the percent is 0 to 100, not 0 to 1 |
| `totem#` | 4 totem swirls from `GetTotemDuration`, with the Cooldown's own countdown numbers turned on |
| `LS widget` | Blizzard's `CustomAuraContainerTemplate` showing Lightning Shield (icon, charges, charge bar, time left). Built out of combat only; `evt:` is the probe's own charge counter |
| `E/F/Fr shock` | One swirl per shock family. The GCD alone never swirls, so a swirl is a real cooldown |
| `swing` | The swing bar from round 2 |

Results land in `visualStats` (per-step ok/fail in and out of combat with the first error of each, `countdownProbes`,
`lsWidget`, `mana`) and `visualErrors`.

### Player checklist

1. Fully restart the beta client. At character select, open AddOns and make sure **RF Probe** is ticked.
2. Log in the Shaman and type `/rfprobe visual`. A small dark frame appears; drag it somewhere handy.
3. Type `/tb` once and note what happens (anything, or nothing).
4. Out of combat: cast Lightning Shield. Then cast one shock and look: do all three shock icons swirl, or only one?
5. Pull a mob and keep auto-attacking. Drop all 4 totems in combat. Look for numbers on the totem swirls, and for
   charges and time left on the LS widget.
6. Cast shocks at different moments: right after a swing lands, and right before the next swing.
7. Start a Lightning Bolt and move to cancel it. Then try a Lightning Bolt on a target that's out of range.
8. Cast heals until your mana is under 20%. Watch the mana bar and the number.
9. If you can, enter a dungeon and do one pull.
10. Type `/reload`, then report:
    - Totem swirls: did they show numbers?
    - LS widget: did it show charges (and time left) in combat?
    - `mana#`: did the number show? Did the bar turn red under 20%? What colour was it at full mana (blue or purple)?
    - Shocks: did one shock make all three icons swirl?
    - What did `/tb` do?

