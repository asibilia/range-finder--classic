# Release targets for Forever

Research for [#7](https://github.com/asibilia/range-finder--classic/issues/7), a child of the map [#3](https://github.com/asibilia/range-finder--classic/issues/3).
Checked on 2026-09-27, during the WoW: Forever beta (build 1.60.1, `## Interface: 16001`; launch 2026-11-04).

**Question:** How do we publish Turbo, a Forever-only addon, to CurseForge and Wago Addons from GitHub Actions?

## Short answer

- **Both stores already list Forever.** CurseForge has a "WoW Forever" game version type (id `88568`) with version `1.60.1` (id `17053`, apiVersion `16001`). Wago has a `forever` type with patch `1.60.1`. Both came from live API calls today.
- **The BigWigs packager already supports Forever.** It has done so since v2.6.0 (2026-09-18). It reads `## Interface: 16???` or a `_Camelot.toc` file name as Forever, then uploads to CurseForge (game id 88568) and Wago (`supported_forever_patches`). Real Forever addons, including a Shaman HUD, publish this way today.
- **Recommendation: use the packager, not a custom Bun script.** Keep Bun for small steps around it if we need them.
- **Don't reuse the old CurseForge project.** CurseForge rules forbid "completely overhaul[ing]" an approved project into a new one. Create a new "Turbo" project and leave "Range Finder (Classic)" alone.

## 1. CurseForge

### Upload API

From the official doc ([CF-API]):

- **Base URL** for WoW: `https://wow.curseforge.com`.
- **Auth:** an `X-Api-Token` header or a `token` query parameter. You create the token at `https://authors.curseforge.com/#/settings/api-tokens`. Tokens belong to your account, not to a project.
- **Game versions:** `GET /api/game/versions` returns `{id, gameVersionTypeID, name, slug}`. `GET /api/game/version-types` returns the flavors.
- **Upload:** `POST /api/projects/{projectId}/upload-file`, sent as multipart with two parts:
  - `file`: the zip.
  - `metadata`: JSON with `changelog`, `changelogType` (`text`, `html` or `markdown`), `displayName`, `gameVersions` (a list of version **ids**), `releaseType` (`alpha`, `beta` or `release`), and the optional `parentFileID`, `isMarkedForManualRelease` and `relations`.
- **Response:** `{ id: fileID }`.

### Is Forever listed? Yes

Live query on 2026-09-27, using the token from `.env.local` (not reproduced here) ([CF-live]):

| What | Value |
|---|---|
| Version type | `{"id":88568,"name":"WoW Forever","slug":"wow-forever"}` |
| Forever versions | only `{"id":17053,"gameVersionTypeID":88568,"name":"1.60.1","slug":"1-60-1","apiVersion":"16001"}` |
| Other types (for contrast) | Retail 517, Classic 67408, BCC 73246, Wrath 73713, Cata 77522, Mists 79434, Titan 81212 |

- **The API needs a token.** Both endpoints return HTTP 401 without it and 200 with the `.env.local` token, so that token is still valid.
- **The old script targeted a different flavor.** `dev-tools/publish.ts` (2023) hardcoded `gameVersions: [10341]`, which is "1.15.0" under WoW Classic (67408). A Forever upload would need `[17053]` today, and a new id after each patch.
- **Correction to an older source.** `forever-addon-kit/README.md` still says "No addon site ... has a Forever game flavour yet". The live APIs show that is now out of date.

### The old project

The public CurseForge page returns 403 to scripts, because it sits behind a Cloudflare challenge. The details below come from the third-party mirror `api.cfwidget.com`, looked up by the project id in `.env.local` ([cfwidget]):

| Field | Value |
|---|---|
| Name | Range Finder (Classic) |
| Slug / URL | `range-finder-classic` / https://www.curseforge.com/wow/addons/range-finder-classic |
| Summary | "Hunter Range Indicators" |
| Owner | `truncha` (the same name as the old TOC `## Author:`) |
| Created | 2023-12-17 |
| Files | 3 releases (2023-12-16 to 2023-12-19), all tagged `1.15.0` (Classic) |
| Downloads | 12,252 total, 0 monthly |
| Categories | Damage Dealer, Action Bars, Unit Frames, Hunter, Combat |

**Can we rename or reuse it? No, not as Turbo.**

- CurseForge's moderation policy says: "It is not allowed to completely overhaul previously approved projects to bypass moderation and/or use their previous popularity for the new project." ([CF-mod])
- Turbo differs from the old project in name, class (Shaman, not Hunter), game flavor (Forever, not Classic Era) and code. That is exactly such an overhaul.
- No CurseForge doc says whether a slug can be changed. The docs we checked ([CF-create], [CF-sub], [CF-mod]) don't cover it.
- **What to do:** create a new project. You can reuse the same account and API token. Optionally, edit the old project's description to point players to Turbo.

### Rules that affect the new project

- **Names** must be unique, or the project is rejected ([CF-create]). They should not contain "game name, class name versions, file versions" ([CF-mod]), nor version numbers or the category name ([CF-sub]).
  - "Turbo" fits these rules.
  - Avoid names like "Turbo Forever" or "Turbo Shaman".
  - "Turbo Class Helper" is the fallback if "Turbo" is taken.
- **Logo:** at least 400×400 PNG, an original graphic, not the game logo ([CF-sub]).
- **Approval:** a new project goes through moderator review before it appears publicly ([CF-create]).
- **Automatic Packaging:** CurseForge can also build zips itself, triggered by a webhook on tags ([CF-auto]). Leave it **off** when we use the packager. ShamanForever turned it off on purpose because "it also fires on new tags, so leaving it on would put two files on every release" ([SF]).

## 2. Wago Addons

- **Token:** from `https://addons.wago.io/account/apikeys`, sent as `Authorization: Bearer <token>` ([Wago-docs]).
- **Project id:** an 8-character alphanumeric string shown on the developer dashboard. It goes in the TOC as `## X-Wago-ID:` ([Wago-docs]).
- **Upload API:** `POST https://addons.wago.io/api/projects/<id>/version`, sent as multipart:
  - `file`: the zip.
  - `metadata`: `label`, `stability` (`stable`, `beta` or `alpha`), `changelog`, and one `supported_<flavor>_patches` array per flavor ([Wago-docs], [PKG] L3059-3142).
- **Forever is supported.** The public docs only list retail, wotlk, bc and classic, but the live flavor list at `https://addons.wago.io/api/data/game` includes `"forever": ["1.60.1"]` ([Wago-live]).
  - The packager maps its `forever` type straight to Wago's `forever` ([PKG] L3070-3075).
  - A real upload has worked: Dynamic Ambiance v0.3.1 uploaded `1.60.1 release` to Wago with "Success!" on 2026-09-25 ([DA]).
- **Slug check:** `addons.wago.io/addons/turbo` and `/turbo-class-helper` both return 404 today. The control `/shamanforever` returns 200. So both Turbo slugs look free.
- **Wago's own automation:** Wago can import GitHub Releases on its own ("Releases Automation"). Use either that or the packager's upload, not both. Otherwise each release shows up twice. This comes from a secondary source ([FAD]) and was not tested.

## 3. BigWigsMods/packager

The source is `release.sh` at master `e50a250f`, which is the same commit as the `v2` and `v2.6.1` tags ([PKG]).

- **History:** Forever support landed in PR #202, "Add WoW Forever support" ([PKG-202]).
  - Merged on 2026-09-17 as commit `7391c8de`.
  - Shipped in v2.6.0 on 2026-09-18.
  - Two follow-up fixes, also on 2026-09-17/18, cover WoWInterface.

### How it detects Forever

The packager treats a build as Forever in any of these ways:

| Way | Code |
|---|---|
| Interface number | `toc_to_type`: `16???) game_type="forever"` ([PKG] L198, L214) |
| TOC file name suffix | `-Camelot` / `_Camelot` maps to `forever` ([PKG] L79, L1175-1177, and the TOC search loops at L1402-1422) |
| `-g` flag | `-g forever` or `-g camelot` ([PKG] L294-296). A version like `-g 1.60.x` also works: major 1 + minor `6[0-9]` means forever ([PKG] L306-309) |
| Version conversion | `16001` becomes `1.60.1` via `printf "%d.%d.%d"` ([PKG] L1355) |
| Store mapping | CurseForge `game_id=88568` ([PKG] L2836). Wago `forever` ([PKG] L3070-3075) |
| WoWInterface | **Not supported:** "No WoWInterface game type match for "forever" ... ignoring" ([PKG] L2955-2957) |

**If the store doesn't know the version yet**, the packager does not fail. For both CurseForge and Wago it uses the next lower known version, or the highest one, and prints a `WARNING` ([PKG] L2841-2855, L3080-3092). So an interface bump at launch that the stores haven't added yet still uploads, just tagged `1.60.1`.

**Release type comes from the tag** ([PKG] L834-849):

- A tag containing `alpha` → alpha.
- A tag containing `beta` → beta.
- Any other tag → release.
- An untagged commit → alpha.

The zip is named `<Name>-<tag>-forever.zip` ([PKG] L140-152; [DA]).

### Secrets

Environment variables the packager reads ([PKG] L494-499; [PKG-README] "Uploading"):

| Store | Current name | Older name, still read |
|---|---|---|
| CurseForge | `CF_API_TOKEN` | `CF_API_KEY` |
| Wago | `WAGO_API_TOKEN` | — |
| GitHub Release | `GITHUB_API_TOKEN` | `GITHUB_OAUTH` (set it to `${{ secrets.GITHUB_TOKEN }}`) |
| WoWInterface | `WOWI_API_TOKEN` | not usable for Forever |

- **Store project ids come from the TOC:** `## X-Curse-Project-ID:` (digits) and `## X-Wago-ID:` ([PKG] L1329-1335).
- **A missing id or token skips that store silently** ([PKG] L2817-2819, L3059-3062). So the workflow can carry every secret from day one, and a tag will only make a GitHub Release until the store projects exist.
- **Local runs source a `.env` file** from the repo root if one exists ([PKG] L486-492). Our secrets live in `.env.local`, so they are not picked up. Keep it that way.

### `.pkgmeta` basics for our monorepo

The packager packages from the **repo root**. It never ships dotfiles or git-untracked files ([PKG] L1141, L1781).

For an addon in a subfolder, set `package-as` and `move-folders`, and ignore everything else. This is the pattern that works in Dynamic Ambiance ([DA] `.pkgmeta`):

```yaml
package-as: Turbo            # required if the only TOC is Turbo_Camelot.toc
move-folders:
  Turbo/packages/addon/Turbo: Turbo
manual-changelog:
  filename: CHANGELOG.md     # or a per-version RELEASE_NOTES.md written by a workflow step (see ShamanForever)
  markup-type: markdown
ignore:
  - packages/web             # every non-addon path must be listed, or it ships inside the zip
  - docs
  - tools
  - README.md
  - CHANGELOG.md
```

- **`package-as` matters for a `_Camelot.toc`-only addon.** Without it, the packager guesses the name from the shortest `*.toc` file name. If that name ends in a flavor suffix, it stops with "Ambiguous addon name ... Set 'package-as' in .pkgmeta" ([PKG] L1386-1398).
  - Shipping both `Turbo.toc` and `Turbo_Camelot.toc` also works: both parse as Forever.
- **TOC fields:**
  - `## Version: @project-version@` gets replaced by the tag.
  - `## X-Curse-Project-ID` and `## X-Wago-ID` hold the store ids.

### Minimal workflow

This follows the packager README and the ShamanForever workflow ([PKG-README], [SF]):

```yaml
on: { push: { tags: ["v*"] } }
permissions: { contents: write }
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }        # the packager reads history for version and changelog
      - uses: BigWigsMods/packager@v2
        env:
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          WAGO_API_TOKEN: ${{ secrets.WAGO_API_TOKEN }}
          GITHUB_OAUTH: ${{ secrets.GITHUB_TOKEN }}
```

The run also creates a GitHub Release with the zip and a `release.json`. For Dynamic Ambiance that file reads `{"flavor":"forever","interface":16001}` ([DA]). The Turbo site's downloads page could link to it.

## 4. Packager vs a custom Bun script

The 2023 `dev-tools/publish.ts` script:

- zipped a hand-picked file list;
- sent it to `upload-file` with a hardcoded version id and the token in the query string;
- then committed and pushed from the developer's machine.

It had no Wago upload, no GitHub Release, no version-id lookup, no fallback and no CI.

| | BigWigs packager | Custom Bun script |
|---|---|---|
| Forever support | Built in and used in production ([PKG], [SF], [DA]) | We write it: find the 88568 version id from the Interface, build the Wago payload |
| CurseForge + Wago + GitHub Release | One step, each store skipped if its id or token is missing | Three API clients to write and maintain |
| Zip layout, `@project-version@`, changelog, `move-folders`, alpha/beta from tag | Built in | We rebuild all of it |
| Patch bumps with no store version yet | Falls back and warns | Must write this ourselves |
| Fits "Bun, never npm" / TypeScript | It's bash in the Action. No npm involved | Yes |
| Community path | TellMeWhen, ShamanForever, Dynamic Ambiance, and most addons | Only us |

**Verdict:** use the packager. This matches the "reuse, don't rebuild" rule. If we need glue, add small Bun steps before or after it:

- pull this version's changelog section;
- check that the zip contains only `Turbo/`;
- bump the TOC interface.

## 5. How Forever addons release today

- **TellMeWhen** ([TMW]):
  - Uses one multi-flavor TOC: `## Interface: 11509, 16001, 20506, 50504, 120100, 120105`, plus `X-Curse-Project-ID`, `X-WoWI-ID` and `X-Wago-ID`. There is no `_Camelot.toc`.
  - `release.yml` validates the version, TOC and changelog, then runs `BigWigsMods/packager@master` with `CF_API_KEY`, `WOWI_API_TOKEN`, `WAGO_API_TOKEN` and `GITHUB_OAUTH`. The packager splits the `16001` value out to CurseForge's Forever type by itself.
  - `update-toc.yml` runs `p3lim/toc-interface-updater@v4` daily, with `flavor:` including `forever` and `beta: true`.
- **ShamanForever**, a Forever Shaman HUD and a **direct competitor** to Turbo ([SF]):
  - TOC: `## Interface: 16001`, `## Version: @project-version@`, `X-Curse-Project-ID: 1706929`, `X-Wago-ID: rN4rkrKD`.
  - Workflow: `BigWigsMods/packager@v2` with `CF_API_KEY`, `WAGO_API_TOKEN` and `GITHUB_OAUTH`.
  - CurseForge automatic packaging is turned off, and it doesn't publish to WoWInterface ("no Forever category").
  - A workflow step writes this version's changelog section to `RELEASE_NOTES.md`.
- **Dynamic Ambiance** ([DA]):
  - The addon lives in the `addons/DynamicAmbiance` subfolder, packaged with `move-folders`.
  - The v0.3.1 run log shows `Uploading DynamicAmbiance-v0.3.1-forever.zip (1.60.1 release) to https://wow.curseforge.com/projects/1711431` and then `Success!`. It shows the same for Wago.
- **SealTimersForever** ([STF]): ships only `SealTimersForever_Camelot.toc` (`## Interface: 16001`). It has no workflow and no `.pkgmeta`, and hands out zips through GitHub Releases. The author also has CurseForge projects.
- **ForeverSwingTimer** ([FST]): a single `ForeverSwingTimer.toc` (`16001`) with no release automation.
- **forever-addon-kit / forever-addon-dev** ([FAK], [FAD]): community kits that document the same packager path. Their claims were checked against the primary sources above; FAK's "no Forever flavour" line is out of date.

## 6. Now vs at launch

**Possible now (beta):**

1. Create the CurseForge project "Turbo" and a Wago project. Moderator approval takes time, so start well before 2026-11-04.
2. Add the ids to the TOC and add the `CF_API_TOKEN` and `WAGO_API_TOKEN` repo secrets. The `.env.local` CurseForge token is valid and can be reused, as long as the new project is created under the same account.
3. Push a tag like `v0.1.0-beta.1`. It lands as a **beta** file on CurseForge (Forever 1.60.1), as `stability: beta` on Wago, and as a GitHub Release.

**At launch:**

1. If Blizzard bumps the build (for example `16002` / `1.60.2`), bump `## Interface`.
   - `p3lim/toc-interface-updater` supports `forever` / `camelot` and `_Camelot` files ([TIU]).
   - For now it reads the `wow_classic_beta` CDN product, and its code says this is provisional.
2. Check that CurseForge and Wago list the new version. The packager falls back if they don't.
3. Cut a plain `vX.Y.Z` tag, which publishes as a **release**.

## Open risks

1. **The launch build may change the numbers.**
   - The interface number, the CDN product (`wow_classic_beta` → `wow_forever`?) and the store version ids may all change.
   - Packager uploads won't fail, but they may be tagged with an old version until the stores catch up.
   - The TOC updater may lag.
2. **The "Turbo" name is not confirmed free on CurseForge.**
   - CurseForge's search is behind Cloudflare, and the cfwidget 404 is only a weak signal.
   - Moderators reject duplicate names, and only a real project submission settles it.
   - Wago slugs look free.
3. **Monorepo zip hygiene.** The packager packages the repo root, so any path missing from `ignore` ends up in the zip. Add a CI check on the zip's contents.
4. **Double uploads.** Turn off CurseForge Automatic Packaging and Wago Releases Automation, or each release appears twice.
5. **The client TOC question is still open.** It's not clear whether a lone `_Camelot.toc` and an unsuffixed `Turbo.toc` with `16001` behave the same in the client. Both are seen in the wild, and the packager handles both. The packaging side is fine either way; only `package-as` is required for the lone `_Camelot` case.
6. **The Wago docs don't mention Forever yet.** Support rests on the live API, the packager code and one observed successful upload.
7. **There is a direct competitor (ShamanForever)** already live on both stores. This matters for positioning and listing text, not for the pipeline.

## Sources

- [CF-API] CurseForge Upload API. https://support.curseforge.com/support/solutions/articles/9000197321-curseforge-upload-api
- [CF-live] Live calls to `https://wow.curseforge.com/api/game/version-types` and `/api/game/versions` with `X-Api-Token`, 2026-09-27 (162 versions returned; 401 without a token).
- [CF-mod] CurseForge Moderation Policies. https://support.curseforge.com/support/solutions/articles/9000197279-moderation-policies
- [CF-sub] Project Submission Guide and Tips. https://support.curseforge.com/support/solutions/articles/9000199552-project-submission-guide-and-tips
- [CF-create] Creating and Submitting a Project. https://support.curseforge.com/support/solutions/articles/9000197241-creating-and-submitting-a-project
- [CF-auto] Automatic Packaging. https://support.curseforge.com/support/solutions/articles/9000197281
- [cfwidget] Third-party CurseForge mirror, `https://api.cfwidget.com/<project id>` and `/wow/addons/<slug>`, 2026-09-27. Used because curseforge.com returns 403 to scripts.
- [Wago-docs] Wago developer docs. https://docs.wago.io/
- [Wago-live] https://addons.wago.io/api/data/game (`.patches.forever == ["1.60.1"]`), 2026-09-27.
- [PKG] BigWigsMods/packager `release.sh` at `e50a250f` (= `v2` = `v2.6.1`). https://github.com/BigWigsMods/packager/blob/e50a250f8705041e40f2fa1ddcb280a686d65aa0/release.sh
- [PKG-README] https://github.com/BigWigsMods/packager/blob/e50a250f8705041e40f2fa1ddcb280a686d65aa0/README.md
- [PKG-202] "Add WoW Forever support". https://github.com/BigWigsMods/packager/pull/202
- [TMW] TellMeWhen: `.github/workflows/release.yml`, `.github/workflows/update-toc.yml`, `.pkgmeta`, `TellMeWhen.toc`. https://github.com/ascott18/TellMeWhen (local clone `/tmp/rf-research/TellMeWhen`)
- [TIU] p3lim/toc-interface-updater README and `update.sh`. https://github.com/p3lim/toc-interface-updater
- [SF] ShamanForever: `.github/workflows/release.yml`, `.pkgmeta`, `ShamanForever.toc`. https://github.com/cassidymichael/ShamanForever
- [DA] Dynamic Ambiance: Actions run 36157660072 log, `.pkgmeta`, `release.json` (v0.3.1). https://github.com/imperial64/dynamic-ambiance-forever
- [STF] SealTimersForever (local clone `/tmp/rf-research/api/SealTimersForever`). https://github.com/Pirson-s-Addons/SealTimersForever
- [FST] ForeverSwingTimer (local clone `/tmp/rf-research/api/ForeverSwingTimer`)
- [FAK] forever-addon-kit `README.md` L53-54 (local clone `/tmp/rf-research/api/forever-addon-kit`)
- [FAD] forever-addon-dev `skills/publish/SKILL.md` and `research/watch-findings.md` W.18 (local clone `/tmp/rf-research/api/forever-addon-dev`). Secondary; used only for leads, which were checked against [PKG], [CF-live], [Wago-live] and [DA].
- This repo: `dev-tools/publish.ts`, `dev-tools/game-versions.ts`, `pkgmeta.yaml` (2023).
