# @goturbo/addon

The Turbo addon for WoW: Forever.

Only the `Turbo/` folder ships. Everything else here (API type stubs, tests,
tool configs, scripts) is dev-only and stays outside it.

## Dev build

From the repo root:

- `bun run dev:link` links `Turbo/` into the beta client's AddOns folder
  (`/Applications/World of Warcraft/_classic_beta_/Interface/AddOns`). Restart
  the client once, then `/reload` after each change.
- `bun run dev:watch` is the fallback if WoW on macOS doesn't follow the link:
  it puts a real copy there and copies again on every save.

Set `WOW_ADDONS_DIR` to use another AddOns folder.
