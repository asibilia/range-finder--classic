# WoW: Forever's native UI vs Turbo v1

Research date: 2026-11-05 (day after launch). Live client checked: `_forever_/.build.info` reports **1.60.1.70790** (product `wowf`).

Everything below was read from Blizzard's own UI code for that exact build, and from the client's data tables for that build, unless a line says otherwise.

- **UI code:** [Gethe/wow-ui-source `forever` @ `eac30af`](https://github.com/Gethe/wow-ui-source/commit/eac30af597e5aaa43a60f6675ef5fdcea100375f) ("1.60.1 (70790)", 2026-11-04). It matches the live build number.
- **Beta comparison:** the beta-era pin in `packages/addon/scripts/fetch-tools.ts` ([`bd2470a`](https://github.com/Gethe/wow-ui-source/commit/bd2470aed543f72697a044e989285b6c83e63f73), 1.60.1 (70009), 2026-09-24).
- **Client data tables:** wago.tools DB2 exports for build `1.60.1.70790` (same build config `9006ba69…` as the local client). Tables used: `CooldownSet`, `CooldownSetSpell`, `CooldownSetLinkedSpell`, `SpellName`, `ChrSpecialization` and `GlobalStrings`. Every English label in quotes below comes from `GlobalStrings`.

Markers used in this file:

- **[unverified]**: worked out from code or data, but not yet seen in the live client.
- **[secondary]**: comes from a community site, not Blizzard.

Every `wow-ui-source` link below is pinned to commit `eac30af`.

---

## 1. Summary

- **Forever adds four native HUD tools, all placed with Edit Mode.**
  - **Cooldown Manager**: Essential Cooldowns, Utility Cooldowns, Tracked Buffs and Tracked Bars.
  - **Swing Timer**: Main Hand, Off Hand and Ranged bars. This one is Forever-only and isn't in retail.
  - **Personal Resource Display**: health and mana bars.
  - **Totem Bar**, plus the existing **Totem Frame** under the player frame.

  Each Edit Mode element has a visibility setting of **Always / In Combat / Hidden**. There's no "has an enemy target" option and no fade.
- **You can't put any spell you like into the Cooldown Manager.** Blizzard's data decides the list. For Shaman, Forever's list includes:
  - Earth Shock and Stormstrike
  - 17 totems
  - Lightning Shield and Flurry

  It does **not** include Maelstrom Weapon, any weapon imbue, Totemic Recall, Stoneskin Totem or Healing Stream Totem. Blizzard has also said that "Item enhancements (such as Windfury or rogue poisons) cannot be tracked".
- **Natively you can get close to:**
  - Turbo's key-cooldown icons: bright when ready, grey on cooldown, **blue when you lack mana**, and also **red when out of range**.
  - Totem timers, shown as icons with a swirl and a countdown.
  - Lightning Shield charges.
  - A main-hand swing bar.
  - Health and mana bars with numbers.
- **Nothing on Forever replaces these Turbo features:**
  - the range band readout
  - the swing **safe window** and greying during hard casts
  - persistent **reminders** for the imbue, Lightning Shield and Totemic Recall
  - the **Maelstrom Weapon** counter and its glow at 5
  - red mana under 20%
  - the "engaged" show/fade rule
  - one position shared by every Edit Mode layout
  - `/turbo macros`
- **Native wins over Turbo:**
  - Flurry is tracked by default. The Turbo spec says addons can't read Flurry in combat.
  - Sound and text-to-speech alerts.
  - Proc glows on the icons.
  - A mana-cost preview on the Personal Resource Display.
  - A clickable totem bar.
- **Launch vs beta pin (70009 → 70790):**
  - The Cooldown Manager API is unchanged.
  - The swing bar now waits for the current swing to finish before dimming for range (Nov 4 note).
  - The Off-Hand swing bar now shows reliably after login.
  - Cooldown Manager entries that track an item's shared cooldown got a small fix.
  - Spell ranks have shown as one Cooldown Manager entry since the Oct 16 beta build.
- **Verdict:** none of the 12 features is a full native match. 8 are partial and 4 can't be done. Turbo is still worth having. Its **key cooldowns** module is the one place where native is roughly as good, and arguably better.

---

## 2. Feature by feature

| # | Turbo feature | Native equivalent (exact name) | Verdict | What's lost or different |
| --- | --- | --- | --- | --- |
| 1 | Range finder: Melee / Shock 20 yd / Bolt 30 yd / Out; hidden for no, friendly or dead target | No range readout. Range cues come from three places:<br>• **Cooldown Manager** icons turn dark red with an out-of-range overlay: Stormstrike = melee, Earth Shock = 20 yd, Chain Lightning = 30 yd ([CooldownViewer.lua#L727](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L727), [#L1204](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L1204))<br>• **Action bar** keybind text (or the "●" dot) turns red ([ActionButton.lua#L1289](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_ActionBar/Shared/ActionButton.lua#L1289))<br>• The **Swing Timer** dims between swings when you're out of melee range | 🟡 | You get three separate icons to read instead of one coloured word. Nothing hides itself for a missing, friendly or dead target. Chain Lightning stands in for Lightning Bolt, which isn't in the Cooldown Manager because it has no cooldown; both are 30 yd in Classic **[unverified on Forever]**. The icons only show once you've learned the spells (Stormstrike is a talent; Chain Lightning is level 32 in Classic **[unverified on Forever]**). |
| 2 | Swing timer: main hand, safe-window marker (first 15%), greys during hard casts, dims out of melee, only while auto-attacking | **Swing Timer → Main Hand** bar ([Blizzard_SwingTimer.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.lua); loads only on Forever, [TOC#L2](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.toc#L2)) | 🟡 | You get the bar, a seconds readout, and Edit Mode size, opacity and visibility. Out of melee range it drops to 40% opacity with red text, but only between swings ([#L2](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.lua#L2), [#L379](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.lua#L379), [#L425](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.lua#L425)).<br>Missing:<br>• **no safe-window marker**<br>• **no greying during a hard cast**<br>• **no restart when a cast ends**: the bar only restarts when the game reports a swing ([#L142](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.lua#L142))<br>• visibility is "In Combat", not "only while auto-attacking" |
| 3 | Totem timers: 4 fixed slots (Earth, Fire, Water, Air); icon, swirl, countdown; pulse in the last 5 s; red flash if killed early | Three native pieces:<br>• **Totem Frame** under the player frame: Earth, Fire, Water, Air order, swirl, seconds left, right-click to dismiss ([TotemFrame.lua#L17](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_UnitFrame/Mainline/TotemFrame.lua#L17))<br>• **Cooldown Manager** totem icons show the totem's time left as a gold swirl with a countdown ([CooldownViewer.lua#L854](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L854))<br>• **Totem Bar** (Edit Mode) is a clickable bar with no timers | 🟡 | The Totem Frame shows only totems that are down (no faded placeholders). It's attached to the player frame, so you can't place it on its own. There's no last-5 s pulse and no red flash.<br>The Cooldown Manager gives one icon per totem spell, not per element. Its list is missing **Stoneskin, Healing Stream, Nature Resistance and Sentry**. |
| 4 | Weapon imbue: icon and time left; glowing reminder when missing, or out of combat with < 5 min left | **Buff Frame** weapon-enchant button: icon, time left and charges; fades in and out in the last 31 s ([BuffFrame.lua#L763](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_BuffFrame/BuffFrame.lua#L763), [#L1](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_BuffFrame/BuffFrame.lua#L1)) | 🟡 | You can't place it separately: it sits in the Buff Frame with every other buff. **No reminder** when it's missing or under 5 min.<br>If the Buff Frame is collapsed, buffs with more than 90 s left are hidden ([AuraUtil.lua#L2](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_FrameXMLUtil/AuraUtil.lua#L2), [BuffFrame.lua#L1462](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_BuffFrame/BuffFrame.lua#L1462)).<br>The Cooldown Manager **can't** track imbues: the data has no entry for them and Blizzard lists it as a known issue. |
| 5 | Lightning Shield: charges 3/2/1; reminder when missing or at 0 | **Cooldown Manager → Tracked Buffs → "Lightning Shield"** (hidden by default; drag it in). Shows the stack count and a duration swirl. Alerts can be added for **"On Aura Removed"** (sound, text-to-speech or a 2 s visual). | 🟡 | The count only shows when it's **2 or more**, so 1 charge shows no number ([CooldownViewer.lua#L1373](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L1373)).<br>A missing shield is just a plain icon without a swirl (with "Hide When Inactive" off), or nothing at all.<br>Visual alerts last about 2 s ([VisualAlertTemplates.xml#L6](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_VisualAlerts/VisualAlertTemplates.xml#L6)). Nothing stays on screen. |
| 6 | Key cooldowns: one shared shock icon and Stormstrike; bright ready / dim on cooldown / blue without mana; ignore the GCD | **Cooldown Manager → Essential Cooldowns**. **Earth Shock** and **Stormstrike** are there by default. | 🟡 (closest to full) | Matches:<br>• greyed only on a real cooldown, not the GCD ([#L976](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L976), [#L1195](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L1195))<br>• the same blue for not enough mana (0.5, 0.5, 1.0) ([#L14](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L14))<br>Extras: a red out-of-range tint and proc glows ([#L1235](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L1235)).<br>Differences:<br>• **the GCD swirl is still drawn** on every cast ([#L1137](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L1137))<br>• you must remove the other default icons<br>• use Earth Shock as "the shock": Flame Shock's icon shows its damage-over-time timer instead of the cooldown while the DoT is up ([CooldownViewerItemData.lua#L802](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewerItemData.lua#L802)) |
| 7 | Mana bar with number, red under 20%; health bar | **Personal Resource Display**: health and mana bars, "Show Bar Text", a mana-cost preview, Edit Mode placement ([PRD.xml#L40](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_PersonalResourceDisplay/Blizzard_PersonalResourceDisplay.xml#L40)) | 🟡 | Health: yes. Mana number: yes; the format follows Interface → "Status Text". **No red below 20%**: the bar always uses the mana colour. |
| 8 | Maelstrom Weapon stacks 0–5, glow at 5 | None in the Cooldown Manager. Maelstrom Weapon (spell 408498) exists on Forever but has no Cooldown Manager entry. The Buff Frame shows the buff. | ❌ | No counter you can place, and no glow at 5. A Blizzard proc glow or spell alert at 5 stacks is an **open question**. |
| 9 | Reminders row: silent glowing icons for a missing imbue or Lightning Shield; hidden while resting, mounted or on a flight path; shown even when the HUD is hidden | None. The closest are the Cooldown Manager's one-shot alerts "On Aura Removed" (sound, text-to-speech or a 2 s visual) and the imbue's fade-out in its last 31 s in the Buff Frame. | ❌ | Nothing stays on screen for a missing buff. There's no resting, mounted or flight-path rule. The "Group Buffs" tab filters buffs on raid frames; it isn't a reminder. |
| 10 | Recall reminder: Totemic Recall icon when a totem is in its last 5 s, or you're 20+ yd from every totem | None. Totemic Recall isn't in the Cooldown Manager data (only Totemic Call is). The Totem Bar has a plain Recall button ([Constants.lua#L246](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_FrameXMLBase/Constants.lua#L246)). | ❌ | No last-seconds trigger and no distance check. You can read the time left on the Totem Frame yourself. |
| 11 | HUD only while engaged (in combat or an enemy targeted), fades otherwise; moved via Edit Mode | Every native piece is its own Edit Mode element with **Visibility: Always / In Combat / Hidden** ([Cooldown Manager](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L1900), [Swing Timer](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.lua#L241), [Personal Resource Display](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_PersonalResourceDisplay/Blizzard_PersonalResourceDisplay.lua#L190)) | 🟡 | No "enemy targeted" condition: before the pull, everything set to In Combat is hidden. No fade; frames just appear and disappear. You place several separate frames instead of one card. Positions are saved per Edit Mode layout (Turbo uses one for all). The Cooldown Manager's icon choices are saved per character ([LayoutManager.lua#L17](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewerSettingsLayoutManager.lua#L17)). |
| 12 | `/turbo macros`: per-character `#showtooltip` / `/startattack` / `/cast` macros swapped onto the bars | No native replacement. The **"Auto Attack/Auto Shot"** checkbox (Options → Combat) only switches between melee auto attack and Auto Shot ([Combat.lua#L202](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/Combat.lua#L202); Oct 16 note: "Hunters will automatically switch…"). | ❌ | Keep it in Turbo. `/startattack` still works in hand-made macros. |

### What the Shaman Cooldown Manager list actually contains (Forever data, build 70790)

Shaman is spec 1489 on Forever, which uses `CooldownSet` 5263. Forever has one spec per class ([PRD Camelot override: "Camelot has no specs"](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_PersonalResourceDisplay/Camelot/Blizzard_PersonalResourceDisplay.lua#L19)).

"Hidden by default" means the entry starts in **"Not Displayed"** and you drag it in. Unlearned spells are hidden unless you tick "Show Unlearned".

| Window category | Shown by default | Hidden by default (you can add) |
| --- | --- | --- |
| **Essential Cooldowns** | Searing Totem, Stormstrike, Chain Lightning, Flame Shock, **Earth Shock**, Fire Nova, Lava Burst (removed from the game in the Nov 3 notes), Rage of the Farseer, Lightning Mastery | Frost Shock, Riptide, Nature's Swiftness, Magma Totem, Flametongue Totem, Grace of Air Totem, Strength of Earth Totem, Windfury Totem |
| **Utility Cooldowns** | an unnamed entry (spell 52127), Totemic Call, Mana Spring Totem, Tremor Totem, Earthbind Totem, Mana Tide Totem | Lightning Shield, Stoneclaw Totem, Fire Resistance Totem, Disease Cleansing Totem, Frost Resistance Totem, Grounding Totem, Windwall Totem, Poison Cleansing Totem |
| **Tracked Buffs / Bars** | Elemental Devastation, Improved Stormstrike, **Flurry**, Elemental Focus (Clearcasting) | **Lightning Shield**, Earthbound, Stormstrike (debuff), Ghost Wolf, Rage of the Farseer, Frost Shock, Flame Shock, Riptide, Water Shield, Nature's Swiftness, Ancestral Fortitude, and the buffs from Mana Spring, Windwall, Grounding, Frost Res, Fire Res, Stoneclaw, Windfury, Strength of Earth, Grace of Air, Flametongue and Mana Tide totems |
| **Items** (not class-specific) | the two trinket slots, plus three item cooldown groups (potions and similar) | — |

**Not in the data at all:** Maelstrom Weapon, Windfury Weapon, Rockbiter Weapon, Flametongue Weapon, Frostbrand Weapon, Totemic Recall, Call of the Elements, Stoneskin Totem, Healing Stream Totem, Nature Resistance Totem, Sentry Totem and Lightning Bolt. All of these exist in Forever's `SpellName` table.

---

## 3. Recreate it natively: step by step

The goal is a Turbo-like stack in the middle of the screen, with Earth Shock, Stormstrike and Chain Lightning as both cooldowns and range cues. Top to bottom:

1. key cooldowns
2. four totems
3. Lightning Shield
4. the swing bar
5. mana and health

### Step 1. Turn the tools on (Options)

1. Press **Esc → Options**. In the Gameplay list on the left, open **"Advanced Options"**.
   - The label comes from the live strings. Blizzard's Sep 24 notes called it "Gameplay Enhancement" (older name).
   - **[unverified]** where exactly it sits in the left-hand list.
2. Under **"Cooldown Manager"**, tick **"Enable Cooldown Manager"**. The same section has two buttons: **"Edit Mode"** and **"Advanced Cooldown Settings"** ([AdvancedOptions.lua#L312](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/AdvancedOptions.lua#L312)).
3. Under **"Swing Timer"**, tick **"Enable Swing Timer"** ([#L372](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/AdvancedOptions.lua#L372)).
4. Open **Combat** and tick **"Personal Resource Display"** ([Combat.lua#L16](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/Combat.lua#L16)). On the same page, keep **"Spell Alert Opacity"** above 0% so Blizzard's proc alerts and glows show.
5. Open **Interface** → **Display** → **"Status Text"** and choose **"Numeric Value"** (or "Both"). This sets the number format on the mana bar ([Interface.lua#L54](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/Interface.lua#L54)). **[unverified]** that the Personal Resource Display follows this setting.

Shortcut: in Edit Mode, a greyed-out checkbox for these tools can be **Shift-clicked** to switch it on without visiting Options ([EditModeTemplates.lua#L281](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeTemplates.lua#L281)).

> Your live `WTF` config already has `cooldownViewerEnabled`, `showSwingTimer` and `nameplateShowSelf` set to 1, so these are on for you.

### Step 2. Make your own Edit Mode layout

1. **Esc → "Edit Mode"** (or type `/editmode`).
2. In the Layout dropdown, make a new layout or copy a preset. **[unverified]**: presets can't be edited directly in retail, and Forever is assumed to work the same.
3. Tick **"Advanced Options"** in the Edit Mode panel. That reveals the Combat checkboxes **"Cooldown Manager"**, **"Personal Resource Display"**, **"Totem Bar"** and **"Swing Timer"**. Tick all four ([EditModeManager.xml#L359](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeManager.xml#L359), [#L399](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeManager.xml#L399), [#L413](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeManager.xml#L413)).
4. Tick "Snap to Elements" too: it helps line the rows up.

### Step 3. Choose what the Cooldown Manager shows

Open it with **`/cdm`** (also `/cooldownmanager`), or with **"Advanced Cooldown Settings"** in Options or on any Cooldown Manager frame in Edit Mode ([SlashCommandRegistration.lua#L1](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/SlashCommandRegistration.lua#L1), [EditModeSystemTemplates.lua#L3095](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeSystemTemplates.lua#L3095)).

The window is titled **"Cooldown Settings"** and has three tabs: **"Spells"**, **"Buffs"** and **"Group Buffs"**.

- **Moving an icon:** drag it to another section, or right-click it and pick "Assign to <section>" or "Remove from Bar" ([CooldownViewerSettings.lua#L345](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewerSettings.lua#L345)).
- **Reordering:** drag icons inside a section.
- **Limits:** spells can only move between Essential, Utility and Not Displayed. Buffs can only move between Tracked Buffs, Tracked Bars and Not Displayed ([#L498](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewerSettings.lua#L498)).

**Spells tab**

1. **"Essential Cooldowns"** (your key-cooldown and range row). Leave **Stormstrike, Earth Shock, Chain Lightning** in that order.
   - Use **"Remove from Bar"** on Flame Shock, Fire Nova, Lava Burst, Rage of the Farseer and Lightning Mastery.
   - Move **Searing Totem** to Utility (next step).
2. **"Utility Cooldowns"** (your totem row). Put four totems here in Earth, Fire, Water, Air order. For example:
   - **Strength of Earth Totem** (from Not Displayed)
   - **Searing Totem** (from Essential)
   - **Mana Spring Totem** (already there)
   - **Windfury Totem** or **Grace of Air Totem** (from Not Displayed)

   Then remove Totemic Call, Tremor, Earthbind, Mana Tide and spell 52127 unless you want them.
   - While a totem is down, its icon shows a **gold swirl and a countdown** of its time left. When the totem ends or dies, the icon goes back to a bright icon (or shows a cooldown if the totem has one) ([CooldownViewer.lua#L854](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua#L854)).
   - **[unverified]** whether a totem killed early clears instantly. The code listens for the game's totem-update event, so it should.
   - There's no Stoneskin or Healing Stream option.

**Buffs tab**

3. **"Tracked Buffs"**: drag **Lightning Shield** from "Not Displayed" in. Keep **Flurry** if you like it. Remove the rest.

**Alerts** (optional, the native stand-in for reminders)

4. Right-click **Lightning Shield** (Buffs tab) → **"Add Alert (0/…)"**:
   - **Type:** "Sound" → **When:** "On Aura Removed" → **Sound Alert:** "Text to Speech" (it says the spell's name).
   - Add a second alert with **Type:** "Visual" → "Marching Ants (Red)". It plays for about 2 s.
5. Optional: right-click **Earth Shock** → **"Add Alert"** → **When:** "Available" → a short sound.

The menu only offers alert events that the entry supports ([CooldownViewerConstantsDocumentation.lua#L44](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/CooldownViewerConstantsDocumentation.lua#L44)).

The icon choices save per character. To copy them to an alt: open the layout dropdown → **"Copy To Clipboard (to share online)"**, then on the alt use **"Import"** ([CooldownViewerSettings.lua#L1190](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewerSettings.lua#L1190)).

### Step 4. Place and style the rows (Edit Mode)

Click each frame in Edit Mode and set the options shown. Setting names come from [EditModeSettingDisplayInfo.lua#L890](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeSettingDisplayInfo.lua#L890); the per-frame rules are in [EditModeSystemTemplates.lua#L2925](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeSystemTemplates.lua#L2925).

| Edit Mode frame | Settings |
| --- | --- |
| **"Essential Cooldowns"** | Orientation **Horizontal**; "# Rows" / "# Columns" = 1 row; Icon Size about **100–120%**; Icon Padding 2–4; Opacity **100%**; Visibility **"In Combat"**; **Show Timer** on; Show Tooltips off. |
| **"Utility Cooldowns"** | Same, but Icon Size about **80–100%**. Place it right under Essential. |
| **"Tracked Buffs"** | Visibility **"Always Visible"**, so Lightning Shield doubles as an out-of-combat check. **"Hide When Inactive" off** keeps the Lightning Shield icon on screen when the shield is missing. It then looks like a plain icon without a swirl; there's no grey-out for missing buffs. Turn it **on** if you'd rather it vanish. Hidden icons keep their slot, so nothing shifts around ([CooldownViewer.xml#L158](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.xml#L158), [LayoutFrame.lua#L38](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SharedXML/LayoutFrame.lua#L38)). |
| **"Tracked Bars"** | Visibility **"Hidden"**, unless you'd like Lightning Shield as a bar instead of an icon. |

The Edit Mode defaults are Visibility "Always Visible", Hide When Inactive on and Show Timer on ([EditModePresetLayouts.lua#L780](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Mainline/EditModePresetLayouts.lua#L780)).

### Step 5. Swing bar

In Edit Mode, click the **Swing Timer "Main Hand"** bar ([settings, #L777](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeSettingDisplayInfo.lua#L777)):

- **Visibility:** "In Combat" (the default is "Always Visible", per [EditModePresetLayouts.lua#L681](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Mainline/EditModePresetLayouts.lua#L681)).
- **Show Time:** on. **Show Bar Title:** off.
- **Width:** about 250–300. **Height:** about 18–22. **Opacity:** 100%.

Put it under the totem row.

Forever Shamans can't dual-wield, so the Off Hand bar won't appear. Set the "Ranged" bar's Visibility to "Hidden" if it ever shows.

### Step 6. Mana and health

In Edit Mode, click **"Personal Resource Display"** ([settings, #L1021](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeSettingDisplayInfo.lua#L1021)):

- **Visibility:** "In Combat".
- **Show Bar Text:** on.
- **Hide Health Bar:** off if you want the health bar (Turbo's prototype had one).
- **Bar Width / Power Bar Height:** to taste.

Put it under the swing bar. It also previews the mana cost of the spell you're casting.

### Step 7. Totem extras

- **Totem Frame:** appears under your player frame by itself whenever a totem is down. Right-click a totem there to dismiss it ([TotemFrame.lua#L61](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_UnitFrame/Mainline/TotemFrame.lua#L61)). Nothing to set up.
- **Totem Bar:** in Edit Mode, tick "Totem Bar" and drag it where you want it. It's a clickable set-up bar: choose one totem per element, drop all four with one cast, and it has a Recall button ([MultiCastActionBarFrame.lua#L262](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_ActionBar/Shared/MultiCastActionBarFrame.lua#L262)). It shows no timers.
  - **[secondary]** mmonster says it needs **Call of the Elements**, learned at level 20.
  - **[unverified]** whether the bar appears without it.

### Step 8. Weapon imbue

- In Edit Mode, click **"Buff Frame"** and keep it where you can see it. The imbue shows as a weapon icon with the time left, and fades in and out in its last 31 s.
- If your Buff Frame is collapsed, click its arrow to expand it. Otherwise the 30-minute imbue stays hidden until it has less than 90 s left. **[unverified]** whether collapse is on by default on Forever.
- Optional: `/console displayTemporaryEnchantIcon 1` shows the imbue's own icon instead of the weapon's ([BuffFrame.lua#L12](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_BuffFrame/BuffFrame.lua#L12)). **[unverified on Forever]**

### Step 9. Range cues on the action bars

Keep **Stormstrike, Earth Shock and Lightning Bolt** on your bars:

- Out of range, the keybind text turns red.
- Unbound buttons show a "●" dot, which turns red.
- Out of mana, the icon turns blue ([ActionButton.lua#L721](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_ActionBar/Shared/ActionButton.lua#L721)).

Combined with the Essential row, this is the closest native "range band":

| Range | Stormstrike | Earth Shock | Chain Lightning |
| --- | --- | --- | --- |
| Melee | normal | normal | normal |
| Shock range (5–20 yd) | red | normal | normal |
| Bolt range (20–30 yd) | red | red | normal |
| Out of range (30+ yd) | red | red | red |

### Step 10. Save

Click **Save** in Edit Mode. The Cooldown Manager saves by itself (a "Cooldown Manager Layout Saved" message appears).

---

## 4. What native can't do, and whether an addon still can

The "Addon on Forever?" column uses the secret-value flags in Forever's 70790 API docs.

| Gap | Addon on Forever? | Notes |
| --- | --- | --- |
| **One range-band readout** (Melee/Shock/Bolt/Out, colours, hidden for no, friendly or dead target) | Yes | `C_Spell.IsSpellInRange` has no secret flag ([SpellDocumentation.lua#L948](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua#L948)). New since the spec: `C_SwingTimer.IsTargetWithinSwingRange` and the `PLAYER_SWING_RANGE_UPDATE` event aren't secret either ([SwingTimerDocumentation.lua#L23](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/SwingTimerDocumentation.lua#L23)). They give Blizzard's own melee-reach check without polling, so they're a candidate to replace the 5-yd item poll. |
| **Swing safe window, greying during hard casts, restart on cast stop, only while auto-attacking** | Yes | `PLAYER_SWING` carries a plain `swingDuration` ([#L43](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/SwingTimerDocumentation.lua#L43)). Cast events are plain. This is still Turbo's headline feature. |
| **Fixed four element slots with faded placeholders, last-5 s pulse, early-death flash, Stoneskin/Healing Stream** | Yes (display-only) | `GetTotemInfo` turns secret when a totem slot is restricted (`SecretWhenTotemSlotSecret`, [TotemDocumentation.lua#L59](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/TotemDocumentation.lua#L59)). Turbo's duration-object → Cooldown-widget path and its self-timed fallback still stand. |
| **Imbue reminder** (missing, or under 5 min out of combat), placeable icon | Yes | `C_Item.GetWeaponEnchantInfo` has no secret flag ([ItemDocumentation.lua#L1141](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/ItemDocumentation.lua#L1141)). |
| **Lightning Shield "1" and an on-screen reminder** | Yes | The charge count works through the aura-container widget (display-only). `GetPlayerAuraBySpellID` is secret under aura restriction ([UnitAuraDocumentation.lua#L397](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitAuraDocumentation.lua#L397)), so in combat a "missing" reminder has to come from the self-counted fallback. |
| **Maelstrom Weapon counter and glow at 5** | Partly | Stacks can be shown display-only through the aura container, but "glow at 5" needs a comparison, which isn't allowed on a secret value. A Blizzard overlay-glow event at 5 stacks, if one exists, would be a clean trigger. Still blocked on the level-gated readability check in the spec. |
| **Red mana under 20%** | Yes | `UnitPowerPercent` takes a curve and returns a secret result ([UnitDocumentation.lua#L2838](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua#L2838)). Turbo's step-curve plan fits. |
| **Reminders row with resting, mounted and flight-path rules** | Yes | `IsResting`, `IsMounted` and `UnitOnTaxi` aren't secret. |
| **Recall reminder** | Yes (open world) | The last-5 s trigger comes from the totem timers. Distance comes from `UnitPosition`, which has no secret flag ([UnitDocumentation.lua#L2714](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua#L2714)). On retail it returns nothing inside instances. **[unverified on Forever]** |
| **"Engaged" visibility (target counts), 0.3 s fade, one position for every layout, one card** | Yes | `UnitAffectingCombat` and `UnitCanAttack` aren't secret. |
| **`/turbo macros`** | Yes (out of combat) | No native equivalent. Keep. |

**Turbo modules that native now covers well:**

- **Key cooldowns.** Native matches it almost exactly, and adds range tint, alerts and proc glows. The only gap is the GCD swirl. Consider dropping this module, or keeping it only as part of the card's look.
- **Flurry and Clearcasting.** The spec ruled these out because addons can't read them in combat. The Cooldown Manager shows them by default, so point players at it instead.

---

## 5. Open questions for the live client

1. **Options tree:** is "Advanced Options" a page under the Gameplay list? (The live strings say "Advanced Options"; the beta notes said "Gameplay Enhancement".)
2. **Is the Cooldown Manager level-gated** on Forever? It checks availability through `C_CooldownViewer.IsCooldownViewerAvailable`, and the reason it gives when unavailable isn't in the code.
3. **After Flame Shock or Frost Shock, does the Earth Shock icon show the shared 6 s shock cooldown?** Expected yes: the game reports the shared cooldown for every shock.
4. **Lightning Shield in Tracked Buffs:** confirm it shows 3 and 2, and nothing at 1.
5. **Totem icons in Utility:** does a totem killed early clear instantly? Does "On Aura Removed" fire for a totem's buff when you walk out of its range or it dies?
6. **Maelstrom Weapon:** does the Buff Frame show its stack count? Does 5 stacks trigger a Blizzard spell alert or action-button glow? If so, "Spell Alert Opacity" plus the action bars would partly cover feature 8.
7. **Totem Bar:** does it appear without Call of the Elements? Is that spell trainable on Forever (level 20 per mmonster **[secondary]**)?
8. **Buff Frame:** is collapse on by default? If so, the imbue is hidden until under 90 s.
9. **Chain Lightning vs Lightning Bolt:** is the base range identical on Forever (30 yd)?
10. **Is the GCD swirl on the Essential icons distracting** enough to matter?
11. **Unnamed Utility entry, spell 52127:** what does it show in game?
12. **Does "Auto Attack/Auto Shot" appear for Shamans?** It's gated by a build option.
13. **Edit Mode presets:** can they be changed directly, or only after "Save As"? Can a new layout be account-wide or character-only?
14. **Server hotfixes** can change the Cooldown Manager list (`COOLDOWN_VIEWER_TABLE_HOTFIXED` exists). Re-check with "Show Unlearned" ticked.

---

## 6. Sources

**Blizzard UI code**, pinned to [`eac30af`](https://github.com/Gethe/wow-ui-source/commit/eac30af597e5aaa43a60f6675ef5fdcea100375f) = 1.60.1 (70790). High confidence: this is the code the live client runs. Forever loads the `Camelot`/`camelot` files.

- Swing Timer: [Blizzard_SwingTimer.toc](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.toc#L2), [Blizzard_SwingTimer.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SwingTimer/Blizzard_SwingTimer.lua), [SwingTimerDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/SwingTimerDocumentation.lua#L43)
- Cooldown Manager:
  - [CooldownViewer.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewer.lua) (colours #L14; range #L727; totems #L854; GCD #L976; desaturation #L1195; tint #L1204; glow #L1235; stacks #L1373; aura-removed alerts #L1857; visibility #L1900)
  - [CooldownViewerItemData.lua#L802](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewerItemData.lua#L802)
  - [CooldownViewerSettings.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_CooldownViewer/CooldownViewerSettings.lua#L122)
  - [CooldownViewerConstantsDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/CooldownViewerConstantsDocumentation.lua#L72)
  - [VisualAlertTemplates.xml#L6](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_VisualAlerts/VisualAlertTemplates.xml#L6)
- Edit Mode:
  - [EditModeSettingDisplayInfo.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeSettingDisplayInfo.lua#L777)
  - [EditModeManager.xml](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Shared/EditModeManager.xml#L359)
  - [Camelot/EditModeManagerOverrides.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Camelot/EditModeManagerOverrides.lua#L15)
  - [EditModeManagerConstantsDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_APIDocumentationGenerated/EditModeManagerConstantsDocumentation.lua#L202)
  - [Mainline/EditModePresetLayouts.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_EditMode/Mainline/EditModePresetLayouts.lua#L681)
- Options:
  - [AdvancedOptions.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/AdvancedOptions.lua#L312)
  - [Camelot/InterfaceOverrides.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/Camelot/InterfaceOverrides.lua#L48): External Defensives **off** on Forever; Cooldown Manager and Swing Timer **on**
  - [Combat.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_SettingsDefinitions_Frame/Combat.lua#L16)
- Totems: [TotemFrame.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_UnitFrame/Mainline/TotemFrame.lua#L17), [MultiCastActionBarFrame.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_ActionBar/Shared/MultiCastActionBarFrame.lua#L262), [Constants.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_FrameXMLBase/Constants.lua#L233)
- Buffs, action bars and the Personal Resource Display: [BuffFrame.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_BuffFrame/BuffFrame.lua#L763), [AuraUtil.lua#L2](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_FrameXMLUtil/AuraUtil.lua#L2), [ActionButton.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_ActionBar/Shared/ActionButton.lua#L1289), [Blizzard_PersonalResourceDisplay.lua](https://github.com/Gethe/wow-ui-source/blob/eac30af597e5aaa43a60f6675ef5fdcea100375f/Interface/AddOns/Blizzard_PersonalResourceDisplay/Blizzard_PersonalResourceDisplay.lua#L190)
- Beta vs launch: a local diff of the folders above between `bd2470a` (70009) and `eac30af` (70790).

**Client data tables**, build 1.60.1.70790 via [wago.tools](https://wago.tools/db2/CooldownSetSpell?build=1.60.1.70790). High confidence on content: these are Blizzard's own tables, dumped by a third party.

- `CooldownSet` (Shaman spec 1489 → set 5263)
- `CooldownSetSpell` and `CooldownSetLinkedSpell` (the Shaman list above)
- `SpellName` (which spells exist on Forever)
- `ChrSpecialization`
- `GlobalStrings`: every English label in quotes. One example: "The Swing Timer is currently disabled. Enable it in the Game Menu in Options > Advanced Options > Swing Timer."

Server hotfixes could differ.

**Blizzard posts.** High confidence on what was said; medium on whether it's current.

- [WoW Forever Beta Development Notes – Updated November 2](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696), read raw post by post:
  - Sep 24 (#1): Cooldown Manager is off by default; "Item enhancements (such as Windfury or rogue poisons) cannot be tracked"
  - Oct 1 (#4) and Oct 8 (#5): every class, racials and trinkets supported
  - Oct 16 (#6): ranks merged; the "Auto Attack/Auto Shot" setting added
  - Nov 3 (#9): Maelstrom Weapon is an Enhancement talent; Lava Burst removed; off-hand swing bar fix
  - Nov 4 (#10): "Swing Timer bar will no longer fade out due to distance until the swing finishes"
- [WoW Forever Beta Known Issues](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-known-issues-september-18/2352687): "The Cooldown Manager is a work in progress" (last updated Oct 8).
- [WoW: Forever—What's New and What Feels Familiar](https://news.blizzard.com/en-us/article/24315821/wow-foreverwhats-new-and-what-feels-familiar): "Advanced options … provide access to elements such as the Cooldown Manager and a Damage Meter".

**Local files** (read-only): `/Applications/World of Warcraft/_forever_/.build.info` (live build) and the player's `WTF/Config.wtf` (`cooldownViewerEnabled`, `showSwingTimer` and `nameplateShowSelf` = 1).

**Secondary** (only used where marked): [mmonster: Built-in features](https://mmonster.co/wow-forever/guides/addons/built-in-features). This is the source of the Totem Bar needing Call of the Elements at level 20. It matches Blizzard's notes elsewhere.
