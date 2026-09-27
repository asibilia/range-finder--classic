# Lua tooling for the Bun monorepo

Research for [#6](https://github.com/asibilia/range-finder--classic/issues/6), a child of the map [#3](https://github.com/asibilia/range-finder--classic/issues/3).
Checked on 2026-09-27, during the WoW: Forever beta (build 1.60.1.70009, `## Interface: 16001`).

**Question:** Which lint, format, type-checking and test tools should Turbo's Lua use, and how do they run locally (through `bun run`, no global installs) and in GitHub Actions (ubuntu, `oven-sh/setup-bun`)?

## Short answer

- **Format with StyLua.** It ships on npm as `@johnnymorganz/stylua-bin`, so `bun add -d` installs it. `bun run` then finds it. No postinstall script is involved, so Bun's script blocking doesn't get in the way. Tested locally.
- **Lint and type-check with LuaLS (`lua-language-server --check`), using Ketho's WoW annotations.** One tool covers undefined globals, typos on typed objects, and wrong argument types. It runs headless and exits `1` when it finds problems. DBM already uses it this way as its main global check in CI. LuaLS isn't on npm, so a small Bun script downloads a pinned release into a gitignored `.tools/` folder.
- **Skip luacheck and selene for v1.** luacheck needs Lua and LuaRocks, or Docker. It also needs a huge hand-kept WoW globals list (WeakAuras': 19,566 lines). DBM turns off luacheck's global checks because "the LuaLS check is better". Selene has no WoW standard library at all, and none of the five addons surveyed use it.
- **The annotations cover every secret-value API on the ticket's list.** That's `C_Secrets`, `issecretvalue`, `DurationObject`, `C_DurationUtil`, `C_CurveUtil`, `SetAlphaFromBoolean`, `SetCooldownFromDurationObject`, `SetTimerDuration`, `C_Spell.GetSpellCooldownDuration` and `GetTotemDuration`. **Forever-only APIs are missing**, though, and Turbo needs some of them: `PLAYER_SWING`, `C_SwingTimer`, `C_Item.GetWeaponEnchantInfo` and several `DurationObject` methods. The fix is a small hand-written `---@meta` stub file, tested below.
- **No tool can catch a secret value being read or compared.** The annotations drop Blizzard's `SecretReturns` / `SecretWhen*` flags, so LuaLS sees `UnitHealth()` as a plain `number`. This is the main open risk. It needs a decision (see the end).
- **Tests: `bun test` + `lua-wasm-bindings`, which gives a real Lua 5.1.5 VM compiled to WASM.** Use it for pure logic only (swing math, range ladder, Lightning Shield counter). Anything that touches secrets stays an in-game check. busted needs a system Lua. wowless is pre-alpha and Docker-only. Tested locally.

## 1. Linters: luacheck vs selene

| | luacheck | selene |
|---|---|---|
| Latest release | v1.2.0, 2024-05-24; commits still land (last 2026-07-31) [LC-rel] | 0.31.0, 2026-05-21 [SE-rel] |
| Install without a global | No npm package (the npm `luacheck` is an unrelated 2015 Node binding [npm-lc]). Needs Lua + LuaRocks, or the Docker image `ghcr.io/lunarmodules/luacheck:v1.2.0` [LC-action] | No npm package (npm `selene` is a Selenium library [npm-se]). Prebuilt zips for linux/macos/windows on GitHub releases [SE-rel] |
| CI | `lunarmodules/luacheck@v1` (Docker) [LC-readme]; addons use `BigWigsMods/luacheck@main` (Docker) [BW-lc] or `nebularg/actions-luacheck` (apt + luarocks; last commit 2024-06-17) [NB-lc] | Manual download |
| WoW globals | Nothing built in. Addons keep their own lists: WeakAuras' `.luacheckrc` is 19,566 lines [WA-lc], BigWigs' 467 [BW-lcrc]. Fields of a listed global are all treated as defined unless you write out a full field map [LC-cfg] | Nothing built in. You'd write a custom YAML std based on `lua51` [SE-std]. No WoW std turned up on GitHub, and none of TMW, WA, DBM, Details or BigWigs has a `selene.toml` [survey] |

- **What the big addons do.** WeakAuras runs luacheck on PRs [WA-pr]. BigWigs runs luacheck plus a custom Lua script [BW-pr]. DBM runs luacheck *but ignores every global warning* (`"1.."`, commented "the LuaLS check is better because it doesn't require us to define every single API functions") and then runs LuaLS [DBM-lc][DBM-ci]. TellMeWhen and Details run no linter in CI, only the packager [TMW-rel][DT-rel].
- **Conclusion.** luacheck's one real advantage over LuaLS is catching typos in namespace calls like `C_Spell.GetSpellCoooldown` (see §3.4). You only get that from a full field map, which means generating and maintaining a WoW globals file. That isn't worth it for v1. selene has no WoW story.

## 2. Formatter: StyLua

- **Status:** v2.5.2, 2026-05-16, actively maintained [SL-rel].
- **Install:** the README lists npm as an official channel: "`@johnnymorganz/stylua-bin` ... a thin wrapper that installs the binary" [SL-readme]. The package pulls the binary through per-platform `optionalDependencies` (`stylua-bin-linux-x64`, `-darwin-arm64`, ...) rather than a postinstall script [npm-sl]. That matters because Bun "only runs lifecycle scripts for packages on an allow list" (`trustedDependencies`) [BUN-life].
- **Tested (2026-09-27, macOS arm64, Bun 1.3.11):** `bun add -d @johnnymorganz/stylua-bin@2.5.2`, then `bunx stylua --version` printed `stylua 2.5.2`. `bunx stylua --check a.lua` printed a diff and exited `1`.
- **Config:** `.stylua.toml` or `stylua.toml`, found by walking up from each file. Options: `syntax` (`Lua51`), `column_width` (120), `indent_type` (`Tabs`), `indent_width`, `quote_style`, `call_parentheses`, `collapse_simple_statement` [SL-readme]. WeakAuras uses `indent_type = "Spaces"`, `indent_width = 2`, `column_width = 180` [WA-sl].
- **CI:** `JohnnyMorganz/stylua-action` exists (v5.0.0, 2026-04-06) [SL-action], but we don't need it. `bun install` already provides the binary on ubuntu through `stylua-bin-linux-x64`.

## 3. Type checking: LuaLS + WoW annotations

### 3.1 Sources and freshness

- **Ketho/vscode-wow-api.** Latest release is 0.22.3 (2026-02-24, "Updated Types and Widget/ScriptObject APIs for 12.0.1"). `master` HEAD is `d0b5b51` (2026-06-24). Nothing newer has shipped since [KE-rel][KE-log][KE-head]. The generator maps each game product to a Gethe/wow-ui-source branch (`live`, `ptr`, `classic_beta`, ...). There is no mapping for the `forever` branch, and the published annotations target retail 12.0.1 [KE-prod].
- **Layout:** `Annotations/Core` holds the generated Blizzard API docs, widgets, script objects and WoW's Lua std. `Annotations/FrameXML` is a git submodule pointing at `NumyAddon/FramexmlAnnotations`, branch `live-mix-into-source` [KE-mod].
- **Forever FrameXML exists elsewhere.** NumyAddon/FramexmlAnnotations has `forever` and `forever-mix-into-source` branches, "Synced to 1.60.1 (70009)" on 2026-09-25 (`8a4e791`) [NU-forever]. Ketho/BlizzardInterfaceResources also has a `forever` branch at `1.60.1 (70009)` (`4149af6`), with GlobalAPI, Events, WidgetAPI and similar dumps [BIR-forever].
- **Editor settings to copy.** The VS Code extension sets `runtime.version = "Lua 5.1"` and disables *every* LuaLS builtin library (`basic`, `string`, `table`, `math`, `os`, `io`, ...), so WoW's own Lua std from `Annotations/Core/Lua` is used instead [KE-luals]. A CLI `.luarc.json` has to do the same.

### 3.2 Secret-value APIs (grep of `Annotations/Core` at `d0b5b51`)

| API | Annotated? | Where |
|---|---|---|
| `C_Secrets.*` | yes, 54 hits | `Blizzard_APIDocumentationGenerated/SecretPredicateAPIDocumentation.lua` |
| `issecretvalue`, `issecrettable`, `canaccessvalue` | yes | `.../FrameScriptDocumentation.lua` |
| `DurationObject` | yes (class, 22 methods incl. `IsZero`, `GetRemainingDuration`, `EvaluateRemainingPercent`, `HasSecretValues`) | `ScriptObject/DurationObject.lua`; `LuaDurationObject` is an alias (`Type/BlizzardType.lua`) |
| `C_DurationUtil.*` | yes (partly, see 3.3) | `.../DurationUtilDocumentation.lua` |
| `C_CurveUtil.*` | yes | `.../CurveUtilDocumentation.lua` |
| `Region:SetAlphaFromBoolean` | yes | `Widget/Base/Region.lua` |
| `Cooldown:SetCooldownFromDurationObject` | yes | `Widget/Frame/Cooldown.lua` |
| `StatusBar:SetTimerDuration` | yes | `Widget/Frame/StatusBar.lua` |
| `C_Spell.GetSpellCooldownDuration` | yes (returns `LuaDurationObject`) | `.../SpellDocumentation.lua` |
| `GetTotemDuration`, `ShouldTotemSlotBeSecret` | yes | `.../TotemDocumentation.lua`, `.../SecretPredicateAPIDocumentation.lua` |

Source: [KE-head] tree, file paths as listed.

### 3.3 Forever gaps

I compared Forever's own `Blizzard_APIDocumentationGenerated` (Gethe/wow-ui-source `forever`, 1.60.1.70009 [WUS-forever]) with the annotations. The script is a name-only regex check, so the numbers are a guide, not exact:

| Kind | In Forever docs | Missing, Ketho `master` | Missing, Ketho 0.22.3 |
|---|---|---|---|
| Namespaced functions | 4,394 | 377 | 470 |
| Global functions | 725 | 42 | 48 |
| Widget/object methods | 1,477 | 210 | 210 |
| Events | 1,805 | 70 | 83 |

**Missing and relevant to Turbo:** `C_SwingTimer.IsTargetWithinSwingRange`, `C_SwingTimer.EnableRangeCheck`, the events `PLAYER_SWING` and `PLAYER_SWING_RANGE_UPDATE` (from `SwingTimerDocumentation.lua`), `C_Item.GetWeaponEnchantInfo` (only the old global `GetWeaponEnchantInfo` is annotated, in `Data/Wiki.lua`), `C_PaperDollInfo.GetTemporaryEnchantmentInfo`, the `DurationObject` methods `HasExpired`, `HasStarted`, `IsActive`, `EvaluateTotalDuration`, `FormatRemainingDuration` / `FormatElapsedDuration` / `FormatTotalDuration`, `GetClock` / `SetClock`, and `C_DurationUtil.CreateDurationTextBinding` / `CreateManualClock` plus the whole DurationTextBinding object. Pinning `master` instead of the 0.22.3 release closes about 100 more gaps for free.

**Two effects:**
- **A missing global is a CI failure.** Using `C_SwingTimer` gives "Undefined global" (tested below).
- **A missing method on a typed class is also a CI failure.** `dur:HasExpired()` would give `undefined-field`, because `DurationObject` is a `---@class`.
- **Missing events are harmless.** `frame:RegisterEvent("PLAYER_SWING")` wasn't flagged (tested), so we only lose autocomplete.

**The fix:** a `---@meta` stub file kept in the repo but outside the shipped addon folder. Blizzard's Forever docs define its contents.

### 3.4 What LuaLS catches (tested 2026-09-27, LuaLS 3.19.1 darwin-arm64, Ketho `d0b5b51` `Annotations/Core`)

A sample `core.lua` used every secret-value API from 3.2 through Turbo-style code (`CreateFrame`, `cd:SetCooldownFromDurationObject(dur)`, `frame:SetAlphaFromBoolean(dur:IsZero(), 0.3, 1)`, `bar:SetTimerDuration(GetTotemDuration(1))`, `issecretvalue(UnitHealth("player"))`, `C_CurveUtil.CreateCurve()`, `C_Secrets.ShouldTotemSlotBeSecret(1)`).

| Case | Result |
|---|---|
| All the secret-value APIs above | no warnings (resolved) |
| `C_SwingTimer.IsTargetWithinSwingRange()` | `Undefined global C_SwingTimer` → exit 1 |
| Same, after adding `types/forever-gaps.lua` (`---@meta`, `C_SwingTimer = {}` + one function) to `workspace.library` | no problems → exit 0 |
| `C_Spell.GetSpellCooldownDuration({})` | param type mismatch (`SpellIdentifier` expected) |
| `GetTime():upper()` | `Undefined field upper` |
| `io.open(...)` with builtins disabled | `Undefined global io` (correct: WoW has no `io`) |
| `strsplit`, `bit.band`, `wipe`, `setmetatable` with builtins disabled | resolved from WoW's Lua std |
| `C_Spell.GetSpellCoooldown(1)` (typo) | **not caught**. Namespaces are plain tables (`C_Spell = {}`), not classes |
| Comparing `UnitHealth("player")` to a number | **not caught**. Annotated as `number`; Blizzard's `SecretReturns = true` flag is dropped |

**Other results from the same runs:**
- **Relative paths resolve from the checked folder.** Paths in `workspace.library` resolve from the `--check` folder. `--configpath` pointing elsewhere breaks them (tested), so keep `.luarc.json` at the root of whatever you check.
- **It's fast.** A run took about 1 second.

### 3.5 Headless in CI

- **The CLI:** `lua-language-server --check=<dir> --checklevel=Warning --check_format=pretty|json [--logpath=...]` [LS-log].
- **Exit codes:** each worker returns `count == 0 and 0 or 1`, and the parent does `os.exit(ret)`. So problems at or above `--checklevel` fail the step [LS-check][LS-init].
- **Download:** releases include `linux-x64` (built on `ubuntu-22.04`, so it runs on `ubuntu-latest`), `darwin-arm64` and `darwin-x64` tarballs [LS-rel][LS-build]. The linux-x64 tarball is 3,677,772 bytes.
- **DBM compiles LuaLS from source instead** (ninja + luamake, pinned `3.18.2`). It checks out Ketho `0.22.3` with submodules and parses `log/check.json` into GitHub annotations [DBM-action]. Prebuilt tarballs make the compile step unnecessary.

## 4. Tests

| Option | Status | Fit for Turbo v1 |
|---|---|---|
| **busted** | v2.3.0, 2026-01-07; active [BU-rel] | Needs system Lua + LuaRocks. In CI that means `leafo/gh-actions-lua` v13 + `gh-actions-luarocks` v6 [LEAFO-lua][LEAFO-rocks]; locally, hererocks [HR]. Breaks the no-global-install rule on dev machines unless we use hererocks. |
| **wowless** | "still pre-alpha. If you run your addon through it, if it outputs any errors, those errors are almost certainly still in Wowless, not your addon". "Development is currently only supported via Docker" [WL-readme]. It already tracks the Forever beta (`wow_classic_beta`: `version 1.60.1`, `build 69977`, `gametype: Camelot`, `tocversion: 16001`) [WL-forever]. Code search found `issecretvalue` only in its API doc YAML, with no sign of secret-value behaviour [WL-search]. | Not practical now. Worth rechecking after launch. |
| **Hand-written stubs + plain Lua** | WeakAuras' `tests/`: `wow_stubs.lua` + `run.lua`, run with `lua5.1 tests/run.lua` after `apt-get install lua5.1` in CI. Their README: the tests "do not emulate the WoW API, taint, or secure execution" [WA-tests][WA-pr] | The right *shape*, but needs a system Lua. |
| **`bun test` + `lua-wasm-bindings`** | npm `lua-wasm-bindings` 0.5.3 (2026-01-26, TypeScriptToLua org): Lua 5.0–5.5 compiled to WASM, exposing the C API (`luaL_newstate`, `luaL_dostring`, ...) [LWB] | **Tested:** under `bun test` (Bun 1.3.11), a Lua 5.1.5 state ran `loadstring` + `setfenv` with a stubbed `GetTime` and returned the expected value. The run took 43 ms, with no global installs. |
| **In-game checks** | Probe / dev build on the installed beta client (map notes) | Still required for anything that touches secrets, widgets or combat events. |

**Recommendation:** write pure logic (swing-timer math, safe-window maths, range ladder, Lightning Shield proc de-dupe) as plain Lua modules. Their clock and inputs get passed in, so they never touch secrets. Test them under `bun test` through a small `lua-wasm-bindings` loader with WoW-std stubs (`strsplit`, `wipe`, `bit`, ...). Everything else stays in-game.

## 5. How active addons set this up

| Addon (HEAD checked) | Lint | Format | Types / LuaLS | Tests | CI |
|---|---|---|---|---|---|
| TellMeWhen (`129644b`, 2026-09-23) | none in CI | none | editor only: `.vscode/settings.json` has `Lua.diagnostics.globals` | none | `release.yml`: bash grep checks (TOC versions, debug calls) + `BigWigsMods/packager@master` [TMW-rel][TMW-vsc] |
| WeakAuras2 (`9158131`, 2026-09-21) | luacheck via `nebularg/actions-luacheck`, `.luacheckrc` 19,566 lines [WA-lc][WA-pr] | `stylua.toml` (2 spaces, col 180) [WA-sl] | `.luarc.json` with Lua 5.1, a long `diagnostics.globals` list and type diagnostics disabled; not run in CI [WA-luarc] | `tests/` sandbox tests under `lua5.1` [WA-tests] | `pull_request.yml` on `ubuntu-22.04` [WA-pr] |
| DBM (`776b849`, 2026-09-25) | luacheck (`BigWigsMods/luacheck@main`) with global checks off [DBM-lc] | none | **LuaLS `--check` in CI** via `DeadlyBossMods/LuaLS-config@main` + Ketho 0.22.3; `.luarc.json` lists Midnight globals such as `issecretvalue`, `C_Secrets` [DBM-ci][DBM-action][DBM-luarc] | `DBM-Test` (DBM's own harness, not examined) | `ci.yml` [DBM-ci] |
| Details (`1fc0b3e`, 2026-09-25) | none | none | none | none | `release.yml`: packager only [DT-rel] |
| BigWigs (`5e0db87`, 2026-09-27) | luacheck (`BigWigsMods/luacheck@main`, Docker) + custom Lua lint script [BW-pr] | none | none | none | `pull_request.yml`, `build.yml` [BW-pr] |

**None of them use Bun.** DBM is the closest model for type-checking. WeakAuras is the closest model for StyLua and small tests.

## Recommendation

**Stack:**
- **Format:** StyLua 2.5.2, from npm.
- **Lint + type-check:** LuaLS 3.19.1 `--check`, with Ketho annotations pinned to `master@d0b5b51` plus a repo-local `forever-gaps.lua` stub file.
- **Unit tests:** `bun test` + `lua-wasm-bindings` 0.5.3, for pure logic only.
- **Everything else:** in-game checks.
- **No luacheck or selene in v1.**

Folder names below are placeholders until the architecture ticket fixes the layout. The one hard rule: stubs, tests and configs stay **outside** the shipped `Turbo/` addon folder.

**Files:**
- `.stylua.toml` (repo root): `syntax = "Lua51"`, plus indent and width settings to taste. StyLua's default is tabs, 120 columns.
- `.luarc.json` (repo root, so VS Code and the CLI read the same file):
  ```json
  {
    "runtime.version": "Lua 5.1",
    "runtime.builtin": { "basic": "disable", "debug": "disable", "io": "disable", "math": "disable", "os": "disable",
                         "package": "disable", "string": "disable", "table": "disable", "utf8": "disable" },
    "workspace.library": [".tools/wow-api/Annotations/Core", "packages/addon/types"],
    "workspace.checkThirdParty": false,
    "workspace.ignoreDir": [".tools", "node_modules", "tools"]
  }
  ```
- `packages/addon/types/forever-gaps.lua`: `---@meta` stubs for the Forever-only APIs Turbo calls (3.3). Copy the signatures from Forever's `Blizzard_APIDocumentationGenerated`.
- `scripts/fetch-lua-tools.ts`: downloads pinned artifacts into gitignored `.tools/` and skips anything already there.
  - `https://github.com/LuaLS/lua-language-server/releases/download/3.19.1/lua-language-server-3.19.1-<linux-x64|darwin-arm64|darwin-x64>.tar.gz` → `.tools/luals/`
  - `https://codeload.github.com/Ketho/vscode-wow-api/tar.gz/d0b5b51fac4c52c493371b9b18e66ce604ea4326` (only `Annotations/Core`) → `.tools/wow-api/`
  - Optionally, NumyAddon/FramexmlAnnotations `forever@8a4e791`, if Turbo uses FrameXML mixins or templates.
  - Check a sha256 for each file, and extract with `Bun.$\`tar -xzf ...\``.
- **Dev dependencies:** `@johnnymorganz/stylua-bin@2.5.2` and `lua-wasm-bindings@0.5.3`. Both are older than TMNB's 7-day `minimumReleaseAge`.

**`package.json` scripts:**
```json
"lua:tools": "bun scripts/fetch-lua-tools.ts",
"lua:format": "stylua packages/addon",
"lua:format:check": "stylua --check packages/addon",
"lua:check": "bun run lua:tools && .tools/luals/bin/lua-language-server --check=. --checklevel=Warning --check_format=pretty --logpath=.tools/luals-log",
"lua:test": "bun test packages/addon",
"lua:all": "bun run lua:format:check && bun run lua:check && bun run lua:test"
```

**CI (added to the TMNB-style `ci.yml` job):**
```yaml
- uses: actions/checkout@v4
- uses: oven-sh/setup-bun@v2
- run: bun install --frozen-lockfile
- uses: actions/cache@v4
  with:
    path: .tools
    key: lua-tools-${{ runner.os }}-${{ hashFiles('scripts/fetch-lua-tools.ts') }}
- run: bun run lua:all
```

If we later want inline PR annotations, `--check_format=json` writes `check.json`. DBM's jq one-liner turns it into `::warning file=...` lines [DBM-action].

## Open risks and decisions this surfaces

1. **No tool enforces "never read, compare or compute a secret value".** LuaLS types `UnitHealth` and friends as plain numbers. Blizzard's Forever docs *do* mark them (`SecretReturns = true` in 19 entries, a `SecretWhen... = true` flag such as `SecretWhenUnitAuraRestricted` in 219, `ConditionalSecret = true` in 20) [WUS-forever]. **Decision needed:** add a small Bun "secret-API guard" that reads those flags and fails CI when addon code calls a flagged API outside an allowlisted display-only module, or rely on code review plus in-game probes.
2. **The annotations lag Forever.** Ketho hasn't released since 2026-02 and has no Forever product. Our stub file has to track Forever patches. Numy's FrameXML `forever` branch *is* current. Recheck Ketho after launch (2026-11-04).
3. **LuaLS misses typos in `C_*` namespace calls** (3.4). In-game testing catches those, and so would an optional later luacheck step with a generated field map.
4. **`lua-wasm-bindings` has a small community** (TypeScriptToLua org, a low-level C-API binding). If it breaks, the fallback is WeakAuras' model: `apt-get install lua5.1` in CI, with hererocks locally.
5. **Pinning `master` instead of a release tag** means no changelog entry covers what we pin. That's acceptable because the SHA is fixed and checked.
6. **Layout constraint for the architecture ticket:** dev-only files (`types/`, tests, `.luarc.json`) must stay out of the packaged `Turbo/` folder, or be excluded in `.pkgmeta`.

## Sources

- [LC-rel]: https://github.com/lunarmodules/luacheck/releases (v1.2.0, 2024-05-24; HEAD `2f764bd` 2026-07-31)
- [LC-readme]: https://github.com/lunarmodules/luacheck/blob/master/README.md (GitHub Actions: `uses: lunarmodules/luacheck@v1`)
- [LC-action]: https://github.com/lunarmodules/luacheck/blob/master/action.yml (`image: docker://ghcr.io/lunarmodules/luacheck:v1.2.0`)
- [LC-cfg]: https://github.com/lunarmodules/luacheck/blob/master/docsrc/config.rst (field definition maps; "any fields within them defined")
- [npm-lc]: https://registry.npmjs.org/luacheck (0.1.2, 2015, `za-creature/node-luacheck`)
- [npm-se]: https://registry.npmjs.org/selene (1.1.1, 2016, Selenium API)
- [SE-rel]: https://github.com/Kampfkarren/selene/releases (0.31.0, 2026-05-21; assets `selene-0.31.0-linux.zip`, `-macos.zip`, `-windows.zip`)
- [SE-std]: https://github.com/Kampfkarren/selene/blob/main/docs/src/usage/std.md (YAML std format, `base: lua51`; builtins lua51–54 + roblox)
- [survey]: GitHub contents API root listings of ascott18/TellMeWhen, WeakAuras/WeakAuras2, DeadlyBossMods/DeadlyBossMods, Tercioo/Details-Damage-Meter, BigWigsMods/BigWigs (2026-09-27)
- [BW-lc]: https://github.com/BigWigsMods/luacheck/blob/main/action.yml ("Runs luacheck in Docker")
- [NB-lc]: https://github.com/nebularg/actions-luacheck/blob/master/action.yml (apt-get luarocks; last commit 2024-06-17)
- [WA-lc]: https://github.com/WeakAuras/WeakAuras2/blob/main/.luacheckrc
- [WA-pr]: https://github.com/WeakAuras/WeakAuras2/blob/main/.github/workflows/pull_request.yml
- [WA-sl]: https://github.com/WeakAuras/WeakAuras2/blob/main/stylua.toml
- [WA-luarc]: https://github.com/WeakAuras/WeakAuras2/blob/main/.luarc.json
- [WA-tests]: https://github.com/WeakAuras/WeakAuras2/tree/main/tests (README.md, run.lua, wow_stubs.lua)
- [BW-pr]: https://github.com/BigWigsMods/BigWigs/blob/master/.github/workflows/pull_request.yml and https://github.com/BigWigsMods/BigWigs/blob/master/.github/workflows/build.yml
- [BW-lcrc]: https://github.com/BigWigsMods/BigWigs/blob/master/.luacheckrc
- [DBM-ci]: https://github.com/DeadlyBossMods/DeadlyBossMods/blob/master/.github/workflows/ci.yml
- [DBM-lc]: https://github.com/DeadlyBossMods/DeadlyBossMods/blob/master/.luacheckrc (`"1.."` ignored, with the comment quoted above)
- [DBM-luarc]: https://github.com/DeadlyBossMods/DeadlyBossMods/blob/master/.luarc.json
- [DBM-action]: https://github.com/DeadlyBossMods/LuaLS-config/blob/main/action.yml and https://github.com/DeadlyBossMods/LuaLS-config/blob/main/Check-Config.lua
- [TMW-rel]: https://github.com/ascott18/TellMeWhen/blob/master/.github/workflows/release.yml
- [TMW-vsc]: https://github.com/ascott18/TellMeWhen/blob/master/.vscode/settings.json
- [DT-rel]: https://github.com/Tercioo/Details-Damage-Meter/blob/master/.github/workflows/release.yml
- [SL-rel]: https://github.com/JohnnyMorganz/StyLua/releases (v2.5.2, 2026-05-16)
- [SL-readme]: https://github.com/JohnnyMorganz/StyLua/blob/main/README.md (npm section; configuration table; `--check`)
- [npm-sl]: https://registry.npmjs.org/@johnnymorganz%2fstylua-bin/latest (`bin: run.js`, per-platform `optionalDependencies`)
- [SL-action]: https://github.com/JohnnyMorganz/stylua-action/releases (v5.0.0, 2026-04-06)
- [BUN-life]: https://bun.com/docs/install/lifecycle ("Bun does not execute arbitrary lifecycle scripts by default"; `trustedDependencies`)
- [KE-rel]: https://github.com/Ketho/vscode-wow-api/releases (0.22.3, 2026-02-24)
- [KE-log]: https://github.com/Ketho/vscode-wow-api/blob/master/CHANGELOG.md
- [KE-head]: https://github.com/Ketho/vscode-wow-api/tree/d0b5b51fac4c52c493371b9b18e66ce604ea4326/Annotations/Core
- [KE-mod]: https://github.com/Ketho/vscode-wow-api/blob/master/.gitmodules
- [KE-prod]: https://github.com/Ketho/vscode-wow-api/blob/master/wowdoc/products.lua (`m.product_gethe`: no `forever` entry)
- [KE-luals]: https://github.com/Ketho/vscode-wow-api/blob/master/src/luals.ts (`builtin` all `"disable"`, `runtime.version` `"Lua 5.1"`)
- [NU-forever]: https://github.com/NumyAddon/FramexmlAnnotations/tree/forever (`8a4e791`, "Synced to 1.60.1 (70009)")
- [BIR-forever]: https://github.com/Ketho/BlizzardInterfaceResources/tree/forever (`4149af6`, "1.60.1 (70009)")
- [WUS-forever]: https://github.com/Gethe/wow-ui-source/tree/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated (1.60.1.70009; `SwingTimerDocumentation.lua`, `UnitDocumentation.lua` `UnitHealth` has `SecretReturns = true`)
- [LS-rel]: https://github.com/LuaLS/lua-language-server/releases/tag/3.19.1 (2026-08-13; linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32 assets)
- [LS-build]: https://github.com/LuaLS/lua-language-server/blob/master/.github/workflows/build.yml (linux-x64 on `ubuntu-22.04`)
- [LS-log]: https://github.com/LuaLS/lua-language-server/blob/master/changelog.md (`--check_format=json|pretty`; `--check` respects `ignoreDir`; `--checklevel` fixes)
- [LS-check]: https://github.com/LuaLS/lua-language-server/blob/3.19.1/script/cli/check_worker.lua (`return count == 0 and 0 or 1`) and https://github.com/LuaLS/lua-language-server/blob/3.19.1/script/cli/check.lua
- [LS-init]: https://github.com/LuaLS/lua-language-server/blob/3.19.1/script/cli/init.lua (`os.exit(ret, true)`)
- [BU-rel]: https://github.com/lunarmodules/busted/releases (v2.3.0, 2026-01-07)
- [LEAFO-lua]: https://github.com/leafo/gh-actions-lua (v13.0.0, 2026-04-23)
- [LEAFO-rocks]: https://github.com/leafo/gh-actions-luarocks (v6.1.0, 2026-04-23)
- [HR]: https://github.com/luarocks/hererocks
- [WL-readme]: https://github.com/wowless/wowless/blob/main/README.md
- [WL-forever]: https://github.com/wowless/wowless/blob/main/data/products/wow_classic_beta/build.yaml
- [WL-search]: GitHub code search `issecretvalue repo:wowless/wowless` (2026-09-27): only `data/products/*/docs.yaml`
- [LWB]: https://github.com/TypeScriptToLua/lua-wasm-bindings and https://registry.npmjs.org/lua-wasm-bindings (0.5.3, 2026-01-26)
- Local experiments (2026-09-27, macOS arm64, Bun 1.3.11): LuaLS 3.19.1 `--check` runs against a sample Turbo file (§3.4); `bunx stylua` 2.5.2 (§2); Lua 5.1.5 via `lua-wasm-bindings` under `bun test` (§4). Scratch files are in `/tmp/rf-research/` and are not committed.
