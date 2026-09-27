# What ShamanForever does

Research for [#20](https://github.com/asibilia/range-finder--classic/issues/20), a child of the map [#3](https://github.com/asibilia/range-finder--classic/issues/3). It feeds [#21](https://github.com/asibilia/range-finder--classic/issues/21) ("How Turbo stands apart from ShamanForever").
Checked on 2026-09-27, during the WoW: Forever beta (build 1.60.1, `## Interface: 16001`). ShamanForever was at **v0.8.0**, commit `3a1c5ecb` on `main` ([SF-src]).

**Question:** What does ShamanForever do, how does it deal with secret values, what does it look like, how popular is it, what are its gaps, and how does it compare with Turbo's v1 decisions?

## Short answer

- **What it is:** a configurable Shaman HUD for Forever, made of icons ("elements") that you arrange in groups, plus a **clickable totem bar** that replaces Blizzard's. It covers Lightning Shield, one shock, weapon imbue, totem cooldowns and timers, Tremor Totem alerts, and a dozen experimental cooldowns ([SF-readme]).
- **What it doesn't do:** no range bands, no melee range, no swing timer, no clip warning, no mana bar, no Maelstrom Weapon, no cast bar. It is a totem, buff and cooldown HUD, not an Enhancement melee HUD.
- **How it handles secrets:** it never does Lua math on a secret. It hands Blizzard's duration objects and aura data to Blizzard's widgets (display-only), reads the few values that stay plain (range, usability, imbues, its own casts), and infers the rest from its own casts ([SF-tech]).
- **Two techniques Turbo hasn't planned for:**
  1. **Blizzard's `CustomAuraContainer`** shows Lightning Shield's exact charges and time left in combat. Turbo's plan counts charges from events.
  2. **The Cooldown widget's own countdown numbers**, fed from `GetTotemDuration`, give exact totem time left in combat. Turbo's plan self-times these numbers from learned durations.
- **Popularity:** 7 days old, 20 releases, ~1,000 CurseForge downloads, about 1 on Wago, 0 GitHub stars or issues. It is small but moving very fast.
- **Licence:** MIT.

## 1. The project at a glance

| Field | Value | Source |
|---|---|---|
| Author | Michael Cassidy (GitHub `cassidymichael`, CurseForge `inter2`) | [SF-toc], [CF-page] |
| First release | v0.1.0, 2026-09-21 (GitHub) | [GH-rel] |
| Latest release | v0.8.0, 2026-09-27 | [GH-rel], [CF-page] |
| Releases | 20 in 7 days (v0.1.0 to v0.8.0), often 2 to 4 a day | [GH-rel] |
| Commits on `main` | 90. There's also a `code-structure` branch, 12 commits ahead (a refactor) | [GH-api] |
| Lua size | ~11,500 lines in 21 files. Options code alone is ~4,000 lines | [SF-src] |
| Libraries | LibStub, CallbackHandler-1.0, LibDataBroker-1.1, LibDBIcon-1.0 (for the minimap button) | [SF-toc], [SF-pkgmeta] |
| Saved data | `ShamanForeverDB`: account table plus named profiles, one per character | [SF-toc], `ShamanForever_Profiles.lua` |
| Licence | MIT, © 2026 Michael Cassidy | [SF-license] |
| How it's built | "created and maintained with the help of AI tools" | [SF-readme] |
| CI | luacheck on every push; BigWigs packager on tags to CurseForge, Wago and GitHub, plus a Discord post | [SF-release] |

## 2. Features

From the README Features section and the 0.8.0 changelog ([SF-readme], [SF-changelog]), checked against the code.

### Elements (icons)

- **Shields.** Lightning Shield charges as a segmented bar, a number, or both, plus time left. A "no shield" look: grey icon, red ring, red tint, or fade in and out. It can track Water Shield or "either" instead (experimental).
- **Shocks.** One icon for Earth, Flame or Frost Shock (you pick which). It shows the cooldown, paints the icon red when the target is out of range, and blue with a blue ring when you're short of mana. You can choose which shock's cost the mana check uses.
- **Weapon Imbue.** Warns while the main hand has no Rockbiter, Flametongue, Frostbrand or Windfury. It shows which one is on, and its time left once under 5 minutes. It can stay hidden until then.
- **Earthbind Totem and Stoneclaw Totem.** Cooldown, plus the totem's time left as a bar, an expiring warning, and a flash if it's killed early.
- **Fire Nova.** Cooldown, and a warning while no fire totem is down.
- **Tremor Totem.** Shows "Tremor!" with a pop, a glow and an optional sound when a mob from a watchlist is your target or on a nameplate. It can also warn when you're feared, charmed or asleep. The watchlist is editable. In dungeons and raids mob names are secret, so only the "you're feared" warning works there.
- **Experimental** (not tested in game by the author): Nature's Swiftness, Mana Tide, Grounding, Stormstrike, Riptide, Rage of the Farseer, Totemic Projection, Reincarnation (with Ankh count), Water Walking, Water Breathing (warns when your breath bar drains), and Elemental Focus (Clearcasting).
- **Idle fade:** an element can fade or hide while there's nothing to act on, and still flash at full strength.
- **Not learned:** elements for spells you don't know stay off screen.

### Totem bar

- One slot per element. Left-click drops your picked totem, right-click dismisses it, and an arrow (or Alt+click) opens a picker, even in combat.
- Countdown per slot, a per-totem warning time, and a red flash plus a cross when a totem is killed early.
- **"Out of range" strip:** a red strip on a slot while your totem is down but you don't have its buff. This only works for totems that buff you. It is a buff check, not a distance check.
- A "not your pick" badge, Call of the Elements and Totemic Recall buttons, key bindings for every action, and Quick Keybind Mode.
- It can replace both of Blizzard's totem frames, only the active-totems display, or neither. The default is **both** ("Everything").

### Looks and layout

- Warning looks: grey icon, red ring, fade in and out. Pulsing glows and "pops" (grow, bounce, hop or shake, with an optional flash, ring or star burst).
- Timers as countdown text, a swipe, a draining bar, or any mix, each styled separately.
- An optional GCD sweep (off by default).
- Groups of elements laid out in rows or columns, each with its own position, icon size, scale, opacity and border. Each element shows always, only in combat, or never.
- **Positioning mode** (its own, not Edit Mode): drag groups, snap to a grid, mouse wheel for size, Ctrl+wheel for scale, Shift+wheel for opacity, and arrow keys to nudge. It locks when combat starts.

### Options and profiles

- A large custom options window (`/sf`, the minimap button, the addon compartment, or Escape > Options > AddOns). It has a page per element, each with a live preview of every state.
- Styles are set once on General, and any element, group or the totem bar can override them.
- Profiles, one per character: create, copy, rename, delete, reset, or share as text.
- Spells are matched by ID. The options are English only.

## 3. How it handles secret values

Its rule, in its own words: "never do Lua math or comparisons on a possibly-secret value; hand Blizzard's objects to Blizzard's widgets instead" ([SF-tech]). Every read goes through a `pcall` wrapper (`ns.safe`) plus an `issecretvalue` check (`ns.isSecret`) ([SF-core]). It never reads the combat log.

### Display-only (Blizzard's widget draws the secret)

| What | How | Source |
|---|---|---|
| Lightning Shield icon, charges, charge bar, time-left swipe | `CreateFrame("AuraContainer", …, "CustomAuraContainerTemplate")` with `AddAuraSlot("HELPFUL", { candidateFilters = { includeSpellIDs = … } })`. Blizzard's untainted code reads the aura and fills the addon's texture, font string, cooldown and status bar through `SetIcon`, `SetApplicationCount`, `SetApplicationBar` and `SetDurationCooldown` | [SF-tech], `ShamanForever_Shield.lua` |
| Elemental Focus glow and pop | the same container, via `AddAuraShownAnimation` and `AddAuraAssignedAnimation` | [SF-tech] |
| Totem-buff "in range" strip | an aura slot per totem bar slot, filtered to `HELPFUL\|PLAYER` and the element's totem buffs | [SF-tech] |
| Shock and other cooldowns | `C_Spell.GetSpellCooldownDuration` → `Cooldown:SetCooldownFromDurationObject` | [SF-tech], `ShamanForever_Cooldowns.lua` |
| Totem time left (numbers, swipe, bar) | `GetTotemDuration(slot)` → `Cooldown:SetCooldownFromDurationObject`. The **countdown numbers are the Cooldown widget's own** (`SetHideCountdownNumbers(false)`, `SetCountdownFont`). The bar uses `StatusBar:SetTimerDuration` | `ShamanForever_Timers.lua`, `ShamanForever_TotemBar.lua` |
| Show or hide on a secret condition | `duration:EvaluateRemainingDuration(curve)` with a `C_CurveUtil` curve, then `SetAlpha(result)`. Used for "no fire totem", expiring warnings, and "killed early" (more than 1.25 s left when the slot empties) versus "ran out" (1.2 s or less) | [SF-tech] |
| Two secret conditions at once | two nested frames, each with its own alpha (the alphas multiply) | [SF-tech] |
| Totem slot icon | `SetTexture(secret icon)` | [SF-tech] |
| "Ready" pop | the Cooldown's `OnCooldownDone` script | [SF-tech] |

### Read directly (plain values)

- **Shock range:** `C_Spell.IsSpellInRange(shock, "target")`, polled 4 times a second and on `SPELL_RANGE_CHECK_UPDATE`. It counts as "out of range" only when the result is not secret and is `false` (`ShamanForever_Cooldowns.lua` L270-276).
- **Not enough mana:** the third return of `C_Spell.IsSpellUsable`, on `SPELL_UPDATE_USABLE` and `UNIT_POWER_UPDATE`. It never reads mana itself.
- **Imbue:** `C_Item.GetWeaponEnchantInfo` (enchant type Imbue), read every time, in combat too ([SF-tech], `ShamanForever_Imbue.lua`).
- **Also read directly:** Ankh count (`C_Item.GetItemCount`), loss of control on the player (`C_LossOfControl`), the breath bar (`MIRROR_TIMER_*`), and `isActive`/`isOnGCD` from `C_Spell.GetSpellCooldown` for idle fading.

### Self-timed or inferred from its own casts

- **Shield "believed up":** exact out of combat. In combat, your own `UNIT_SPELLCAST_SUCCEEDED` for a shield sets it to "up". **Nothing can set it to "down" in combat**, so a shield that drops mid-fight shows a faint "In-combat fallback" look until you recast or combat ends ([SF-tech]).
- **Which totem is in a slot:** the last totem you cast into it, from `UNIT_SPELLCAST_SUCCEEDED` in the same frame as `PLAYER_TOTEM_UPDATE`. After a `/reload` in combat, the timer stays hidden until combat ends or you recast.
- **Other timers from casts:** Nature's Swiftness "primed", Stormstrike's 12 s or 2 charges, Rage of the Farseer's 25 s. Water Walking and Water Breathing carry on from the last reading.

### Secure actions (clicking in combat)

The totem bar is made of secure buttons set up out of combat:

- `destroytotem` dismisses a totem.
- `action` on the multi-cast slot drops your pick.
- Pickers run through `SecureHandlerWrapScript` snippets, which work on Forever since build 70009.
- Recall's right-click runs a macro that `/click`s four dismiss helpers.
- Layout changes wait until combat ends ([SF-tech]).

## 4. How it looks

From `screenshot.png` and `docs/gallery/` ([SF-gallery]):

- **In game:** flat square spell icons with 1 to 2 px black borders, laid out in small rows. Lightning Shield has a thin light-blue segmented bar along the bottom. Totem uptime shows as a green bar with small green numbers in the corner. Cooldowns show large white countdown numbers in the middle (for example "10" on Earth Shock). Idle or unlearned icons are greyed and faded.
- **Totem bar:** a row of square totem slots between the Call of the Elements and Totemic Recall buttons, with small "5m", "38" and "2m" countdowns and a coloured time bar under each. A picker opens as a column of totem icons above a slot.
- **Positioning mode:** a dark grid overlay with a blue centre crosshair and labelled boxes ("Group 1" … "Group 8", "Totem bar"). A help panel lists the drag, wheel and arrow-key controls, with Snapping, Show grid, Grid size, Options and Lock buttons.
- **Options window:** a tall, Blizzard-styled parchment-dark frame with a custom logo in the corner. The left nav lists Home, General, Layout, Totem bar, Elements (15 sub-pages; experimental ones greyed), Profiles and About. Each page opens with a painted banner (public-domain landscape art), the element icon, and a **Preview** box with state buttons (for Shocks: Ready, Cooldown, No mana, Out of range, Both). Below are dropdowns, sliders and checkboxes. It is dense but well labelled.
- **CurseForge gallery:** 7 images: two in-game screenshots and options pages ([CF-page]).

## 5. Popularity and update cadence

| Where | Numbers (2026-09-27) | Source |
|---|---|---|
| CurseForge | **1,016 downloads**. Created 2026-09-23. 16 files, all tagged `1.60.1` (Forever). Busiest files: v0.7.2 (212), v0.6.2 (169), v0.8.0 (117 in its first hours). 6 comments. Categories: Class, Shaman | [CF-page], [cfwidget] |
| Wago | download_count **1**, likes 0, last update Sep 27 2026. Categories: Combat, Class. Not verified | [Wago] |
| GitHub | 0 stars, 0 forks, **0 issues and 0 PRs ever**. Release zip downloads are in single digits | [GH-api], [GH-rel] |
| Feedback channels | a Discord server, CurseForge comments, GitHub issues, and Ko-fi for donations | [SF-readme] |

The cadence is very fast: 20 releases in 7 days, with same-day fixes. The one reported bug was fixed in a release a few hours after it was reported ([CF-comments]). Most traffic comes through CurseForge.

## 6. Known gaps and bugs

- **Missing for an Enhancement player:** no swing timer or clip warning, no melee range or range bands, no mana bar or number, no Maelstrom Weapon, no cast bar.
- **Many features are untested:** 11 elements plus Water Shield tracking are marked experimental "because they need spells or talents I haven't been able to try" ([SF-readme]).
- **Shield drops in combat go unseen:** only the "fallback" look shows. The count text only prints for 2 or more charges (Blizzard's limit); the bar shows 1 charge ([SF-tech]).
- **Totem range is a buff check:** only for buff totems. It lags a few seconds after you leave range, and another Shaman's identical totem can mask yours ([SF-tech], [CF-comments]).
- **`/reload` in combat** hides totem timers until combat ends or you recast.
- **Tremor watchlist** doesn't work in dungeons or raids (names are secret there).
- **It changes Blizzard frames by default:**
  - It makes Blizzard's `TotemFrame` invisible (`SetAlpha(0)` plus a hook that keeps it at 0).
  - It replaces the multi-cast totem bar.
  - It moves and hides the beta Issue Reporter.
  - A player reported that Blizzard's totem tracker came back in 0.7.x; it was fixed in 0.8.0 ([CF-comments], [SF-changelog]).
- **Options are English only.** The gallery's options screenshots are auto-captured ("experimental").
- **No open issues** exist to mine. All feedback so far is 6 CurseForge comments: a feature request (totem range, shipped in 0.7.0) and the TotemFrame bug.

## 7. Compared with Turbo's v1 decisions

"Stronger" or "weaker" is from ShamanForever's side.

| Turbo v1 decision (map #3) | ShamanForever | Verdict |
|---|---|---|
| **Range bands** Melee / Shock / Bolt / Out (5 yd item check, 2-miss hysteresis) | Only the shock icon turns red when the shock is out of range (`IsSpellInRange`, 4 Hz). No melee or bolt band, no range readout | **Missing.** Turbo only |
| **Swing timer + safe-window clip warning** (`PLAYER_SWING`) | None | **Missing.** Turbo only |
| **Totem timers:** 4 fixed slots, self-timed numbers + game swirl, durations learned out of combat, pulse in the last 5 s, red flash on early death, no range | A clickable secure totem bar with pickers, key bindings and Call/Recall. **Exact countdown numbers from Blizzard's Cooldown widget** (no learning needed). Per-totem warning time, killed-early flash + cross, "not your pick" badge, buff-based range strip | **Stronger.** Its numbers technique would remove Turbo's duration learning and the "first drop has no number" gap. It hides Blizzard's frames to do this, which Turbo won't |
| **Weapon imbue + reminder** (under 5 min out of combat, only if gone in combat; silent glow; hidden while resting, mounted or on a taxi) | Same API (`C_Item.GetWeaponEnchantInfo`). Shows which imbue, time under 5 min, can hide until then. No resting/mount/taxi suppression. It sits in the HUD, not as a separate reminder | **Equal** on data. Turbo is a little smarter about when to nag |
| **Lightning Shield charges** counted from `SPELL_UPDATE_COOLDOWN` procs (0.3 s dedupe), resynced after combat | **Exact** charges, bar and time left in combat via `CustomAuraContainer`. It can't see the shield drop in combat | **Stronger** display. Turbo's counter can still tell "0 charges = down", which ShamanForever can't |
| **One shared shock icon**, GCD ignored, blue when low on mana | One shock icon (you pick which), red when out of range, blue + ring when out of mana, optional GCD sweep | **Equal.** It also has the range tint Turbo puts in its range finder |
| **Key cooldowns** (Stormstrike once learned) | Stormstrike (experimental) plus Earthbind, Stoneclaw, Fire Nova, Nature's Swiftness, Mana Tide, Grounding, Riptide, Rage of the Farseer, Totemic Projection, Reincarnation | **Stronger** (broader, mostly untested) |
| **Mana bar + number, red under 20%** | None (only the "not enough mana" tint) | **Missing** |
| **Maelstrom Weapon** stacks if readable | None | **Missing** |
| **HUD shows while engaged**; reminders show even when hidden | Per element: always, in combat, or never. Groups can be combat-only. Idle fade | **Different.** Turbo's "engaged" rule (combat or an attackable target) is richer; its idle fade is a nice touch |
| **No cast bar, no rotation hint, no Flurry/Clearcasting** | No cast bar or rotation hint. Has Elemental Focus (Clearcasting), experimental | Equal (it has an extra) |
| **Settings:** an Options → AddOns page + `/turbo`, per account split by class, no profiles, Edit Mode for one position | A big custom window with live previews, per-character profiles with text import/export, a minimap button, its own grid positioning mode, many groups | **Stronger** on customisation. Turbo is simpler by design |
| **Architecture:** no libraries, one safe-read layer enforced by a CI guard | 4 libraries (only for the minimap button). A `pcall` + `issecretvalue` wrapper by convention, luacheck in CI | Similar idea. Turbo's is stricter |
| **Never change Blizzard's frames** | Hides Blizzard's totem frames by default, moves the Issue Reporter | **Weaker** against Turbo's rule. It also caused its one reported bug |
| **Spell IDs, English-only text** | Same | Equal |
| **Release:** BigWigs packager to CurseForge, Wago, GitHub | Same, plus a Discord post | Equal |
| Not in Turbo v1 | Tremor Totem watchlist and fear alerts, Reincarnation/Ankh count, Water Breathing alert | Extras |

**Where they overlap:** shield, shock, imbue and totem time left. **Where Turbo is alone:** the Enhancement melee loop (range bands, swing timer + clip warning, mana, Maelstrom). **Where ShamanForever is ahead:** totem control, breadth of cooldowns, and customisation.

## 8. Worth flagging for the map (not decided here)

1. **Totem numbers:** ShamanForever shows exact in-combat totem time with the Cooldown widget's own countdown text on a `GetTotemDuration` object. Turbo's probe already confirmed `GetTotemDuration` → `SetCooldownFromDurationObject` works in combat (round 2). If the numbers render too, Turbo's "self-timed numbers + learned durations" could shrink to "Blizzard's numbers" (#15).
2. **Lightning Shield:** `CustomAuraContainerTemplate` gives exact charges in combat. Turbo's probe tested `C_UnitAuras` (which throws), not this container. That is worth one probe check before build (#16). Turbo's event counter still earns its place for the "shield gone" reminder.
3. **Positioning (#21):** ShamanForever is a totem/buff/cooldown HUD with a totem bar. Turbo is an Enhancement combat HUD (range + swing + clip). They overlap on four icons, not on the core pitch.

## Sources

- [SF-src] ShamanForever source, `main` at `3a1c5ecbdda5f2436f7a7640bc8ae514e510eee4` (= v0.8.0), downloaded as a tarball to `/tmp/shamanforever/ShamanForever-HEAD/`. https://github.com/cassidymichael/ShamanForever/tree/3a1c5ecbdda5f2436f7a7640bc8ae514e510eee4
- [SF-readme] `README.md` (Features, How it works, Development, Licence). Same commit.
- [SF-changelog] `CHANGELOG.md`, 0.1.0 to 0.8.0. Same commit.
- [SF-tech] `docs/combat-techniques.md` (the author's notes on each in-combat technique, tested on builds 69913/70009, dated 2026-09-23 to 2026-09-27). Same commit.
- [SF-core] `ShamanForever_Core.lua` (`ns.isSecret`, `ns.safe`). Also `ShamanForever_Shield.lua`, `ShamanForever_Cooldowns.lua`, `ShamanForever_Timers.lua`, `ShamanForever_TotemBar.lua`, `ShamanForever_Imbue.lua`, `ShamanForever_Profiles.lua`, `ShamanForever_IssueReporter.lua`. Same commit.
- [SF-toc] `ShamanForever.toc`. [SF-pkgmeta] `.pkgmeta`. [SF-license] `LICENSE`. [SF-release] `.github/workflows/release.yml`, `lint.yml`, `docs/releasing.md`. Same commit.
- [SF-gallery] `screenshot.png`, `docs/gallery/*.png` (hud-elements, hud-positioning, shocks, shields, totem-bar viewed). Same commit.
- [GH-api] GitHub API, `repos/cassidymichael/ShamanForever` (stars, forks, issues, branches, commits, compare `main...code-structure`), 2026-09-27.
- [GH-rel] GitHub API, `repos/cassidymichael/ShamanForever/releases` (tags, dates, asset download counts), 2026-09-27.
- [CF-page] CurseForge project page, https://www.curseforge.com/wow/addons/shamanforever (project 1706929), scraped with Firecrawl on 2026-09-27 because curseforge.com returns 403 to plain scripts.
- [CF-comments] https://www.curseforge.com/wow/addons/shamanforever/comments (6 comments), scraped with Firecrawl on 2026-09-27.
- [cfwidget] `https://api.cfwidget.com/1706929` (third-party CurseForge mirror: per-file download counts, dates, versions). Used only for the per-file numbers; its total (1,016) matches [CF-page].
- [Wago] https://addons.wago.io/addons/shamanforever (project `rN4rkrKD`), the page's embedded Inertia `data-page` JSON, 2026-09-27.
- Turbo side: map [#3](https://github.com/asibilia/range-finder--classic/issues/3) "Decisions so far", and the MuninnDB vault `rangefinder-classic`: decisions #15 (totems), #16 (imbue/LS), #17 (range/cooldowns/mana), and probe round 2 (2026-09-27).
