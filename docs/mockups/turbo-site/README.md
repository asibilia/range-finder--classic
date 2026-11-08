# Turbo site mockups (#39)

Two landing-page directions for the Turbo site. **These are mockups only**:
single static HTML files with placeholder links, screenshots and import
string. The real site is React Router + Vite on a Cloudflare Worker (per #39,
in `packages/web/`) and isn't built yet. Pick one direction; it becomes the
brief for the real thing.

Open the HTML files straight in a browser. The PNGs are full-page captures at
1440 and 390 px wide.

| Direction | Page | Desktop | Mobile |
| --- | --- | --- | --- |
| A, Action bar | `direction-a-action-bar.html` | `direction-a-desktop.png` | `direction-a-mobile.png` |
| B, Three lines | `direction-b-three-lines.html` | `direction-b-desktop.png` | `direction-b-mobile.png` |

## Direction A: Action bar

Dark and game-native, so it feels at home next to the game. The hero is a
game-style window: an action bar of five Shaman attack buttons (abstract
CSS-drawn icons, no Blizzard art) that swap one by one from "Rank N" to Turbo
macros. Under the bar are the macro editor showing the three lines and the
chat reply "Turbo made 5 macros and swapped 5 buttons." (the addon's real
message). Features are a game-style tooltip with green "Use:" lines, next to
the safety rules. Palette: warm umber `#1d1712`, stone panels `#2a221b`, brass
`#c9a04e`, ember glow `#e0693a`, parchment text `#ecdfc3`, plus the game's
chat yellow and tooltip green in the in-game bits only. Fonts: Marcellus (a
free cousin of the game's display face) for headings, Alegreya Sans for body,
Barlow Semi Condensed for anything rendered "in game".

## Direction B: Three lines

Light, calm and typographic. The hero is the macro itself, set huge in
condensed Archivo, with a margin note on each line saying what it does. The
spell name (the only blue) cycles through the five Shaman attack spells. The
headline sits under it, then plain two-column lists, figure-style screenshot
placeholders, big numbered setup steps, and one dark band for the Cooldown
Manager. Palette: storm-grey paper `#e9eef1`, white sheet `#f7f9fa`, navy ink
`#17203a`, graphite `#56617a`, rules `#bcc6cf`, one accent, storm blue
`#2c43c8`. Fonts: Archivo (its width axis does the heavy lifting), Newsreader
italic for the notes and captions, Fragment Mono for things you type or paste.

## For the owner to confirm

- **Headline.** A: "Top rank, auto-attack, every press." B: "The macro you'd
  write yourself, made for every spell on your bars." Either one works on
  either page.
- **The copy describes Turbo after #51.** Both pages say what `/turbo macros`
  does once #51 ships: a macro for every spell on your bars, every class, with
  `/startattack` only on attack spells. The scope line now says "Works for
  every class." Each sentence that needs #51 has a `<!-- NEEDS #51 -->` (or
  `<!-- SCOPE LINE / NEEDS #51 -->`) comment holding the wording that is true
  on `main` today (five Shaman shock and lightning spells, Shaman only). If
  the site goes up before #51, swap those back.
- **The Cooldown Manager bonus.** Should the site link a Turbo-made layout
  for Blizzard's own UI at all? It's an Enhancement Shaman layout, and its
  import isn't checked in game yet (`tools/cdm-layout/README.md`), so the
  section is marked `<!-- UNTESTED -->`: keep it off the real site until
  someone imports it in the beta client. The real import string comes from
  `bun tools/cdm-layout/build.ts`. The mockups use a fake `1|PLACEHOLDER...`
  string with a Copy button, and the layout summary comes from
  `tools/cdm-layout/README.md`.
- **Footer disclaimer.** Both pages add "A fan-made addon for WoW: Forever. Not
  affiliated with Blizzard Entertainment." Keep it or cut it.
- **Download.** Every download button says "Download on CurseForge" and links
  to `#`. CurseForge is the only store named, and no other addon is named
  anywhere.
- **Screenshots.** Both pages ask for two: the action bars after
  `/turbo macros`, and the macro window's Character tab.

## For the real build

- **Self-host the fonts.** The mockups load them from Google Fonts, which
  sends each visitor's IP to Google.
- **Let the hero animation stop.** B's spell name cycles forever (A's bar
  swaps once). Stop it after one lap or add a pause button (WCAG 2.2.2).
