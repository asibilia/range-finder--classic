# Changesets

Every PR into `main` carries a changeset (`bun run changeset`), and
`.github/workflows/require-changesets.yml` fails a PR without one. Pick
`@goturbo/addon` and/or `@goturbo/web`, choose a bump, and commit the generated
`.changeset/*.md` file. Repo and tooling changes use a `patch` on the package
they serve.

Both packages are `"private": true`; nothing is published to npm.

## Releases

Merging the Version PR is the only release step:

1. On every push to `main`, `.github/workflows/changesets.yml` keeps a Version
   PR open while changesets are pending.
2. Merging it bumps the versions and writes `packages/addon/CHANGELOG.md`.
3. On that push nothing is pending, so `packages/addon/scripts/release-tag.ts`
   tags the merge `v<addon version>`, and the workflow pushes the tag and runs
   `.github/workflows/release.yml`.
4. The BigWigs packager builds `Turbo` from `packages/addon/Turbo` only
   (`packages/addon/.pkgmeta`), `check-package.ts` checks the zip, and
   the packager uploads it with the newest changelog entry as its notes: to
   CurseForge and Wago once their project ids and tokens are set, and to a
   GitHub Release.

Changesets is in beta pre-release mode (`pre.json`), so versions are
`0.x.y-beta.N` and each release is a pre-release. At Forever's launch,
`bunx changeset pre exit` makes the next version `1.0.0`.
