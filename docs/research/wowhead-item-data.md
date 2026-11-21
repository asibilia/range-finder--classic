# Outside item data, Wowhead tooltips and 3D for the armory planner

Research for #63 and the gate in #127 §5. Evidence checked 2026-11-19/20 against the live official pages and scripts linked below. This is evidence for a human decision, not legal advice or approval to implement.

## Decision

**Wowhead tooltips: ONLY IF** all of these are true:

1. the armory stays non-commercial and uses Wowhead's official, remotely hosted tooltip script as documented—never a scrape, self-hosted copy, proxy, cache or republished Wowhead dataset;
2. every item uses the **Forever** environment (`domain=forever`, internally `dataEnv=16`), never Wowhead's `classic` domain or `data: 'classic'` mode;
3. local item names, sources and Classic-data warnings remain authoritative for the planner, with a working fallback for unknown IDs, errors and offline use;
4. the owner accepts and documents the new third-party requests **and the trust involved in running mutable third-party JavaScript in the armory's origin**, where it can technically read the page and its stored results file; and
5. the same-origin build checks, host allow-list, privacy text, accessibility and offline tests are deliberately updated, as #127 §5 requires.

If condition 4 is unacceptable, the answer is **no**. There is no same-origin script design that both keeps the current local privacy boundary absolutely and gives Wowhead's script the same access as armory code. A plain external link remains available without running that script.

The other answers are not interchangeable with that verdict:

| Question | Verdict |
| --- | --- |
| May Wowhead's item data be extracted and redistributed? | **No**, not under the reviewed terms. The documented tooltip embed is not a data-redistribution license. |
| May WoWSims' code be used and redistributed? | **Yes**, under its MIT notice; upstream also asks for a user-visible link back. |
| Does that MIT license clear the item database for public display? | **Only if** the separate Blizzard and source-data conditions below are accepted and their notices/licenses are retained. MIT alone is not enough. |
| Is there an unambiguously permissive source for all Forever names, icons, stats and sources? | **No such source was verified.** WoWSims is technically useful but has mixed provenance. |
| Can the current armory add a supported 3D character viewer? | **No drop-in option was verified.** Only revisit with the required permission and a display-ID/assets pipeline; keep the owner's 2D art meanwhile. |
| Can Blizzard icons, models or fonts be shipped as assets? | **Only if** the limited non-commercial, unmodified-use and notice conditions below are met; there is no general open asset license. Model files need a separate review, and no Blizzard font is needed. |

## 1. What Wowhead permits

Wowhead expressly offers its tooltip script for other sites and documents this installation: configure `whTooltips`, then load `https://wow.zamimg.com/js/tooltips.js`. It supports custom link destinations through `data-wowhead`, and the other-domain option selects a game version. This is the permissioned integration path Turbo should use. ([Wowhead tooltip documentation](https://www.wowhead.com/tooltips))

Wowhead's page identifies the governing ZAM/Fanbyte terms and privacy policy in its page data. The terms grant a limited, revocable, non-commercial license, including API use in the manner described by its documentation, but prohibit reproduction/redistribution, data mining, automated downloading outside ZAM or ordinary browsers, and framing/mirroring without express written consent. ([ZAM terms §4 and §8](https://corp.fanbyte.com/legal/terms); [Wowhead page metadata naming those terms](https://www.wowhead.com/tooltips))

Therefore:

- **Allowed:** the documented remote tooltip embed on a non-commercial fan planner.
- **Not established as allowed:** copying `tooltips.js` or its CSS into Turbo, harvesting tooltip JSON into a local item database, proxying responses to hide the third party, or framing Wowhead's model viewer.
- Wowhead invites feature requests at `feedback@wowhead.com`; that is the route if written confirmation for Forever external tooltips or model-viewer embedding is wanted. ([Tooltip documentation](https://www.wowhead.com/tooltips))

## 2. Forever item and ID coverage

Wowhead does know a distinct Forever dataset; this is not just Classic or retail data. Its current script declares `CLASSICPLUS: 16`, maps that environment's selector to `forever`, and sends tooltip requests to `nether.wowhead.com/tooltip/<type>/<id>?dataEnv=<n>&locale=<n>`. ([Official `tooltips.js`](https://wow.zamimg.com/js/tooltips.js?c5a882f9))

Small, targeted checks against that official endpoint prove both support and the need for fallback:

| Check | Official response | Conclusion |
| --- | --- | --- |
| [Rage of the Storm, Forever, ID 280604](https://nether.wowhead.com/tooltip/item/280604?dataEnv=16&locale=0) | 200; name, icon, 16 Strength, speed 3.60 and equip effect | A high, Forever-specific ID has a real tooltip. |
| [Totem of Charged Flames, Forever, ID 263412](https://nether.wowhead.com/tooltip/item/263412?dataEnv=16&locale=0) | 200; real Shaman relic tooltip | A second custom ID works even though it is in WoWSims' leftover DB rather than its main DB (`packages/sim/upstream/assets/database/leftover_db.json:3111`; `packages/armory/src/browser-sim/gear.ts:125-141`). |
| [Rage of the Storm, Classic mode](https://nether.wowhead.com/tooltip/item/280604?dataEnv=4&locale=0) | 404 `Entity not found` | `classic` is not a fallback for custom Forever IDs. |
| [Unknown ID 999999, Forever](https://nether.wowhead.com/tooltip/item/999999?dataEnv=16&locale=0) | 404 `ID is out of range` | Unknown/custom IDs must retain local presentation and must not break the planner. |
| [Thunderfury, Forever](https://nether.wowhead.com/tooltip/item/19019?dataEnv=16&locale=0) vs [Thunderfury, Classic](https://nether.wowhead.com/tooltip/item/19019?dataEnv=4&locale=0) | Both 200, but Classic has an extra 16–30 Nature damage row and a different DPS line | Even an old ID needs Forever mode; an old ID is not proof that Classic data is current. |

There is first-party game evidence for one of those samples: Blizzard's 10 November hotfix says Rage of the Storm now has 16 Strength and speed 3.6, matching the Forever tooltip. ([Blizzard's official Forever hotfixes, 10 November 2026, Items](https://worldofwarcraft.blizzard.com/en-us/news/24315281)) Turbo's vendored row independently has the same ID, name, 16 Strength and 3.6 speed (`packages/sim/upstream/assets/database/db.json:6928`; the upstream pin is recorded at `packages/sim/UPSTREAM.md:9-16`).

**Coverage limit:** these checks do not prove that every one of the thousands of WoWSims IDs has a tooltip, that every tooltip is current, or that every item has complete source data. An exhaustive automated audit would conflict with the reviewed ZAM automated-download restriction unless Wowhead permitted it. The implementation must therefore use per-item error fallback and a small manually reviewed Forever fixture set, not a claim of universal coverage.

For links and `data-wowhead`, use `https://www.wowhead.com/forever/item=<id>` and `domain=forever`; do not infer support from an ID being present in WoWSims, and do not use the internal `classicplus` label as the public domain.

## 3. Browser requests and privacy

The reviewed remote-script path does the following:

- on installation, the browser fetches Wowhead's mutable JavaScript and its `universal.css` from `wow.zamimg.com`;
- when an item tooltip is requested, the script makes an XHR GET to `nether.wowhead.com/tooltip/item/<id>` with the data environment and locale in the query;
- tooltip icons come from `wow.zamimg.com/images/wow/icons/...`;
- item scaling or spell data can cause additional requests when options such as `lvl` need them. Turbo should not pass those options for the basic item tooltip.

([Official script and its `getIconUrl`, tooltip-request and scaling-request paths](https://wow.zamimg.com/js/tooltips.js?c5a882f9); [example icon response](https://wow.zamimg.com/images/wow/icons/large/inv_mace_42.jpg))

Thus a basic integration intentionally discloses the visit and the requested **item IDs** to Wowhead/ZAM, plus ordinary connection metadata such as IP address and browser details. ZAM's privacy policy says its services automatically collect technical information including IP, browser/device data, click-through and usage data; it also describes cookies, advertising partners and international processing. It does **not** establish that every tooltip request is used for targeted advertising, so that stronger claim should not be made. ([ZAM privacy policy, “What information we collect,” cookies and sharing](https://corp.fanbyte.com/legal/privacy))

Two boundaries need plain wording:

1. **Request contents:** Turbo can avoid putting a character name, export text, results JSON, fight plan or account identifier in any URL or request body. Only the item ID is necessary. A page-level `Referrer-Policy: no-referrer` can also prevent the armory URL being sent as referrer. Exact cookies and browser headers were not verified in a real browser and vary with browser/privacy settings.
2. **Script privileges:** the official script is not sandboxed. Once loaded, it has the armory origin's DOM and storage access. Turbo currently stores the last results file as text under `armory:last-results-file` (`packages/armory/src/remembered-file.ts:1-16,59-70,86-105`). The reviewed tooltip path does not need that file, but “the current requests contain only item IDs” is not a technical guarantee that present or future third-party code cannot read it. This is the central trade-off the owner must accept or reject.

The armory currently promises same-origin-only files and no outbound character data (`packages/armory/README.md:25-28,92-116,151-159`). Its build test rejects unexpected server URLs, and its source rule allows network calls only in narrowly reviewed modules (`packages/armory/tests/build-output.slow.test.ts:168-187,291-302,339-378`; `packages/armory/tests/network-rule.ts:1-47`). Adding Wowhead changes the product's privacy contract; it must not be slipped in by broadening those guards to “any external request.”

## 4. Item data that Turbo may show or redistribute

### WoWSims code and generated database

WoWSims Forever's MIT license permits code copying, modification and redistribution with its copyright and license notice; its README requests a user-visible link back to the project. ([WoWSims LICENSE](https://raw.githubusercontent.com/wowsims/forever/47205c966132ef52b5d12cef97dac6ebe017190c/LICENSE); [WoWSims README](https://github.com/wowsims/forever/tree/47205c966132ef52b5d12cef97dac6ebe017190c)) Turbo already preserves the MIT file and distinguishes that license from Blizzard's game data (`packages/sim/upstream/LICENSE:1-21`; `packages/sim/README.md:83-94`).

Technically, the database is useful: it contains IDs, names, icon names, stats/scaling and item-source records. The generator reads an extracted `wowsims.db`, produces `db.json` and `leftover_db.json`, and Turbo already copies those JSON files plus `item_first_seen.json` into the browser build. ([WoWSims `gen_db/main.go`](https://raw.githubusercontent.com/wowsims/forever/47205c966132ef52b5d12cef97dac6ebe017190c/tools/database/gen_db/main.go); `packages/sim/scripts/build.ts:38-41,93-99`; `packages/armory/src/browser-sim/gear.ts:13-38,125-141`) Icon fields are names, not redistributable image files, and not every row has an icon or source. The armory's current `DbItem` reader does not even expose the icon field (`packages/armory/src/browser-sim/gear.ts:13-38`).

The rights are mixed rather than a blanket MIT grant:

- WoWSims' generator merges game-file extraction with **QuestieDB** source metadata. Its own comment calls QuestieDB GPLv3. ([WoWSims `questie.go`](https://raw.githubusercontent.com/wowsims/forever/47205c966132ef52b5d12cef97dac6ebe017190c/tools/database/questie.go))
- QuestieDB's actual license is more cautious: it permits copying under GPLv3 as far as the team can grant it, but says content is “all rights reserved” when in doubt and cannot promise consent from all historic contributors. ([QuestieDB LICENSE](https://raw.githubusercontent.com/Questie/QuestieDB/master/LICENSE.md); [its provenance](https://raw.githubusercontent.com/Questie/QuestieDB/master/PROVENANCE.md))
- The same generator also merges AtlasLoot MoP source data; that repository carries GPLv2. ([WoWSims `atlasloot.go`](https://raw.githubusercontent.com/wowsims/forever/47205c966132ef52b5d12cef97dac6ebe017190c/tools/database/atlasloot.go); [AtlasLoot MoP LICENSE](https://raw.githubusercontent.com/snowflame0/AtlasLootClassic_MoP/main/LICENSE))

**Recommendation:** continue to credit WoWSims and preserve all applicable notices, but do not repackage its database as “MIT item data.” Displaying the existing rows in the non-commercial armory is **only if** the human gate accepts Blizzard's limited fan-use terms and the QuestieDB/AtlasLoot conditions above. A separate, cleaned public item-data product would need another provenance and license review, especially for source metadata and icons.

Wowhead is not an alternative redistributable source: its terms and documented embed do not grant that right. ([ZAM terms §4 and §8](https://corp.fanbyte.com/legal/terms))

### Blizzard Developer API

Blizzard's API terms do permit a registered application to distribute API data to its end users for personal use, but require registration, attribution and a maximum 30-day refresh/TTL rather than a permanent static data redistribution. ([Blizzard Developer API Terms §2, especially §2.13 and §2.18](https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use)) The reviewed official WoW game-data documentation describes the static/dynamic APIs and namespace requirement, but no official Forever item endpoint was found or verified. ([Blizzard WoW game-data API documentation](https://develop.battle.net/documentation/world-of-warcraft/game-data-apis)) Therefore Blizzard's API is a possible future source **only if** an official Forever item endpoint and a registered, refreshing integration are established; it is not evidence for a redistributable Forever database today.

## 5. What `data: 'classic'` must mean

The results schema already says `classic` means the item's stats and source **may predate Forever** (`packages/armory/src/results-file.ts:59-88`). Turbo assigns that label from an ID threshold and WoWSims' first-seen timestamp, not from a Wowhead environment (`packages/armory/src/browser-sim/gear.ts:48-51,191-204`). The picker deliberately displays a Classic-data warning (`packages/armory/src/components/item-picker.tsx:115-124,191-196`).

Rules for tooltips:

- `data` is a **freshness/provenance warning**, never a reason to request Classic mode. Every Wowhead request stays `dataEnv=16`/`domain=forever`.
- Never overwrite the sim's stats, sources, EP calculations or local names from a tooltip. The sim and display must not silently disagree about which values drive a plan.
- Keep the existing warning next to a Classic-tagged item and label the remote presentation “Wowhead Forever.” If the two differ, leave the planner's values unchanged and do not silently reclassify the item as `forever`.
- Prefer a plain link plus the local warning for a Classic-tagged row whose remote values have not been reviewed. A rich tooltip can be enabled after a per-item comparison; Thunderfury proves why comparison matters.
- Unknown, made-up and failed items keep the current name/source/fallback. In particular, the bundled sample's made-up item 99901 must not be presented as real remote data (`packages/armory/README.md:326-347`; `packages/armory/tests/unknown-items.test.ts:20-28,34-103`).

## 6. 3D character-model feasibility

Wowhead has a `classicplus` viewer bundle, and its page metadata versions that viewer separately from Classic. ([Wowhead page metadata](https://www.wowhead.com/tooltips); [official viewer bundle](https://wow.zamimg.com/modelviewer/classicplus/viewer/viewer.min.js)) That does not establish a supported fan-site API:

- The viewer code requires a `contentPath` and downloads model and supporting files including M2, skin, bone, texture and character-customization metadata. ([Viewer bundle](https://wow.zamimg.com/modelviewer/classicplus/viewer/viewer.min.js))
- Wowhead's official WHML model guide is for guides hosted on Wowhead, not an external-site license. It says item rendering uses internal **display IDs**, not ordinary item IDs, and NPCs/objects likewise use their own internal IDs. ([Wowhead WHML guide](https://www.wowhead.com/guide/advanced-wowhead-embed-markup)) Turbo's result item has `item_id`, stats and source but no display ID (`packages/armory/src/results-file.ts:59-88`).
- ZAM's terms do not provide the same explicit external embed path as the tooltip documentation and prohibit framing/mirroring without written consent. No official Wowhead document offering external model-viewer embedding was found. ([ZAM terms §8](https://corp.fanbyte.com/legal/terms); [tooltip docs as the contrasting explicit offer](https://www.wowhead.com/tooltips))

Two open-source options do not remove those barriers:

- Miorey's browser wrapper is ISC in its package metadata, but its own README says it wraps Wowhead's `ZamModelViewer`, needs Wowhead content and a `CONTENT_PATH`, uses display IDs, supports WotLK/retail rather than Forever, and recommends a CORS-bypass replica. It grants rights to the wrapper, not Wowhead's viewer or game assets. ([Miorey README](https://raw.githubusercontent.com/Miorey/wow-model-viewer/master/README.md); [package.json](https://raw.githubusercontent.com/Miorey/wow-model-viewer/master/package.json))
- WoW Model Viewer is GPLv3-or-later and reads models from the user's installed game, but it is a Windows desktop program, not a browser viewer; its repository does not include the game files. ([Official README](https://raw.githubusercontent.com/wowmodelviewer/wowmodelviewer/develop/readme.md); [LICENSE](https://raw.githubusercontent.com/wowmodelviewer/wowmodelviewer/develop/LICENSE))

**Verdict:** no supported, privacy-compatible Forever 3D viewer for this armory was verified. Only revisit after written Wowhead permission for the hosted viewer/assets or a separately cleared assets pipeline, plus a display-ID mapping and proof of Forever support. Do not adopt a CORS bypass or ship extracted models based on a wrapper's license. The current owner's art is same-origin and needs no third-party game model (`packages/armory/README.md:263-277`).

## 7. Blizzard's fan-site and asset rules

Blizzard's legal FAQ explicitly answers that fan sites may use Blizzard images, text and sound within limits. It grants a personal, non-exclusive, non-transferable license to use/display one copy of downloaded content for **home, non-commercial and personal use**, requires copyright notices, prohibits alteration/reverse engineering, and makes the license revocable. ([Blizzard Legal FAQ, fan-site answer](https://www.blizzard.com/legal/28d5ebbf-c245-4408-8ba9-043dd5f056bf/faq-prawny))

The current EULA separately prohibits unauthorized reverse engineering, copying outside its license grant, and unauthorized processes that collect or mine information stored by the platform. ([Blizzard EULA §1.C.i and §1.C.vi](https://www.blizzard.com/legal/fba4d00f-c7e4-4883-b8b9-1b4500a402ea/blizzard-end-user-license-agreement)) Blizzard's trademark guidelines additionally require non-commercial/high-quality use, proper marks and credit, no confusing domain/brand use, and no implication of sponsorship or endorsement. ([Blizzard trademark guidelines](https://www.blizzard.com/legal/8bcb0794-6641-4ce3-a573-8eb243bab342/blizzard-entertainment-logo-and-trademark-guidelines))

Applied to the planner:

- **Icons:** only if displayed unmodified in the non-commercial fan context with Blizzard/WoWSims notices. Letting Wowhead's approved tooltip embed fetch its icons avoids creating a new Turbo icon distribution, but does not remove Blizzard's conditions.
- **Models:** the FAQ is not a blanket model-file extraction/redistribution license. Do not ship or convert client model assets without a separate permission/review.
- **Fonts:** no separate general Blizzard-font redistribution license was verified. The FAQ's limited downloaded-content conditions are not permission to repackage any font under an open license. Keep the armory's existing self-hosted JetBrains Mono and system fonts; no Blizzard font is necessary (`packages/armory/README.md:226-239`; `packages/armory/tests/build-output.slow.test.ts:205-215`).
- **Attribution:** retain the existing visible WoWSims/game-data credit (`packages/sim/README.md:83-94`), add Wowhead credit/link for tooltips, and do not imply that Blizzard, Wowhead or WoWSims endorses Turbo.

## 8. Concrete allowed tooltip design, if the owner approves

This design follows the official embed and keeps failure local. It is a specification for the human gate, not implemented work.

1. **Default to no third-party load.** Show a local “Enable Wowhead tooltips” control explaining that Wowhead receives the visit and requested item IDs and that its script runs in the armory origin. Load only after explicit opt-in; keep the choice in memory so no new storage key is needed. Declining or going offline changes nothing.
2. **Use one `ItemLink` seam.** Render an anchor to `https://www.wowhead.com/forever/item=<id>` with `data-wowhead="item=<id>&domain=forever"`. Set `colorLinks`, `iconizeLinks` and `renameLinks` false so Turbo's names and design remain intact. Do not pass `lvl` or unrelated modifiers. Use the documented script only; never call the tooltip JSON endpoint directly from product code.
3. **Preserve interaction semantics.** The slot's existing button cannot contain another interactive element (`packages/armory/src/components/slot-button.tsx:154-164,236-250`). Put the item-name anchor in a sibling overlay following the existing `Best:`/`Next:` pattern, leaving the rest of the slot button's click behavior unchanged. Picker, wishlist and next-step names are plain text today and can use the same anchor seam (`packages/armory/src/components/item-picker.tsx:140-209,247-272`).
4. **Refresh dynamic React content and add keyboard behavior.** Wowhead exposes `$WowheadPower.refreshLinks()` in its official script. Its remote initialization listens for mouseover and touch, not ordinary anchor focus, so the seam must route focus/blur into the same presentation, support tap without navigating accidentally, and close on Escape. Test keyboard, touch, dialog containment and focus return rather than assuming the stock script supplies them. ([Official script](https://wow.zamimg.com/js/tooltips.js?c5a882f9))
5. **Bound network changes.** Update the source network rule for the one loader module and the production allow-list only for `wow.zamimg.com`, `nether.wowhead.com` and user-initiated `www.wowhead.com` links. Add a restrictive CSP and `Referrer-Policy: no-referrer`; assert there are no other third-party hosts. Do not weaken the same-origin checks wholesale.
6. **Handle each item independently.** Cache only the script's normal browser state, not a Turbo-created response dataset. On error, unknown ID or timeout, retain the local name/source and Classic warning and do not retry continuously. Never fabricate a tooltip for sample or unknown items.
7. **Keep source truth and credit visible.** Remote tooltip values never enter planner state. Show “Wowhead Forever” and retain WoWSims/Blizzard credit and the Classic-data warning. No Wowhead HTML or response JSON enters the repo or results files.
8. **Test without live CI dependencies.** Use a mocked official-script seam for dynamic rendering, focus/tap, errors and offline behavior; manually verify the small official samples above in a real browser. Extend production-build tests to prove no request occurs before opt-in and no unexpected host occurs afterward.

## 9. Not verified / left for the human gate

- No exhaustive Wowhead coverage or freshness audit was performed, and no claim of complete Forever coverage is justified.
- Exact cookie behavior, downstream advertising use and future behavior of mutable third-party scripts were not verified. A real-browser network trace is required before implementation approval.
- No public document was found that gives an unambiguous, all-rights-cleared redistribution license for Blizzard's extracted data, models or fonts, or for all historic QuestieDB contributions.
- No official external Wowhead model-viewer embedding documentation or Forever display-ID mapping was found.
- The owner still needs to accept or reject the third-party-script trust trade-off and the mixed item-data license conditions. This report does not approve #141 or any asset implementation.
