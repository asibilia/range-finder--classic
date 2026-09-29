# Changesets

Every PR into `main` carries a changeset (`bun run changeset`), and
`.github/workflows/require-changesets.yml` fails a PR without one. Pick
`@goturbo/addon` and/or `@goturbo/web`, choose a bump, and commit the generated
`.changeset/*.md` file. Repo and tooling changes use a `patch` on the package
they serve.

Both packages are `"private": true`; nothing is published to npm. How versions
turn into releases (a Version PR, the `v<version>` tag, the BigWigs packager)
is set up with the release pipeline.
