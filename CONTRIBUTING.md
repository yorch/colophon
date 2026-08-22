# Contributing

## Getting set up

Node 22 or 24, and Yarn 4 via corepack.

```bash
corepack enable
yarn install
yarn verify        # lint + arch lint + typecheck + test
```

`yarn start` runs a real Backstage app with Colophon installed; `yarn dev:seed`
publishes this repository's own `docs/` into it. See
[Running it for real](README.md#running-it-for-real).

## Pull requests

- `yarn verify` must pass. It is the same gate CI runs.
- Add a changeset if you changed a published package (see below). CI fails the
  pull request without one.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `fix:`, `feat:`, `docs:`, `chore:`, `refactor:`, `test:`, with an optional
  scope — `fix(site): …`.

## Changesets

A changeset says what changed and how it should bump the version:

```bash
yarn changeset
```

It asks which packages changed and whether the change is a patch, minor or
major, then writes a markdown file under `.changeset/`. Commit it with your
work.

The five published packages are a **fixed group**: they version and release
together. They are one system with one contract, so a release where
`colophon-common` moved and the plugins did not would be a combination nobody
has run. A package with no changes therefore still gets a version bump, which
is the cheaper of the two mistakes. `dev-app/*` is private and never published,
so it needs no changeset.

For a change with no user-visible effect — a test, a CI tweak — record that
deliberately rather than skipping the check:

```bash
yarn changeset add --empty
```

## Releasing

Merging a pull request that contains changesets makes the Release workflow open
a **"chore: version packages"** pull request. That pull request contains the
version bumps, the updated interdependency ranges and the generated changelogs.

**Merging that pull request is what publishes.** Review the version numbers
first: an npm version cannot be unpublished after 72 hours, so this is the last
point at which a mistake is cheap.

A successful publish also pushes a single `v0.1.0`-style git tag and creates
one GitHub release for it, covering all five packages. Changesets would
otherwise tag and release each package separately — five near-identical entries
per version, and nothing to link to when someone asks what is in a version.
Note that its `createGithubReleases` flag also controls whether tags are pushed
at all, which is why `scripts/github-release.mjs` pushes the tag itself.

Releases currently go out under the `next` dist-tag, so `npm install
@brnby/plugin-colophon` resolves to nothing while the bundle contract is still
moving. To promote a version once you are ready to stand behind it:

```bash
npm dist-tag add @brnby/colophon-common@0.1.0 latest
npm dist-tag add @brnby/colophon-cli@0.1.0 latest
npm dist-tag add @brnby/plugin-colophon@0.1.0 latest
npm dist-tag add @brnby/plugin-colophon-react@0.1.0 latest
npm dist-tag add @brnby/plugin-colophon-backend@0.1.0 latest
```

To publish to `latest` from then on, drop `--tag next` from the `release`
script in the root `package.json`.

### Why the release job rebuilds and re-verifies

`prepack` rewrites each package's entrypoints from `src/` to `dist/`, and needs
type declarations that only `yarn tsc` emits. A CI runner has neither, and
**npm does not error when a tarball contains no files** — an unbuilt workspace
publishes successfully and every consumer's import fails, on a version number
that is now spent. `scripts/check-packables.mjs` refuses to publish a package
with nothing under `dist/`, so a reordering of those steps fails loudly rather
than silently shipping nothing.

### First-time setup for a new package

npm cannot configure a trusted publisher for a package that does not exist yet
([npm/cli#8544](https://github.com/npm/cli/issues/8544)), so a brand-new
package cannot be published over OIDC. Bootstrapping is:

1. Add an npm **granular access token** as the `NPM_TOKEN` repository secret.
   It must grant **read and write** on the `@brnby` **scope** — not on selected
   packages, which cannot cover packages that do not exist yet.
2. Let the Release workflow publish once. The token reaches npm through
   `YARN_NPM_AUTH_TOKEN`, **not** `NODE_AUTH_TOKEN`: changesets detects the
   workspace tool and publishes a Yarn Berry repo with `yarn npm publish`,
   which reads Yarn's own configuration and ignores both `NODE_AUTH_TOKEN` and
   the `.npmrc` that `actions/setup-node` writes.
3. On npmjs.com, open each package's **Settings → Trusted publisher** and point
   it at this repository and `.github/workflows/release.yml`.
4. Delete the `NPM_TOKEN` secret and the `NODE_AUTH_TOKEN` line from the
   workflow. OIDC takes over, and there is no longer a credential to rotate.

After step 4 every release carries a provenance attestation linking the tarball
to the commit and workflow that produced it. Yarn performs the OIDC exchange
itself from 4.9.0 onwards; this repository pins 4.13.0.
