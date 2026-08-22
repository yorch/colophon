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

Two things about that pull request are expected and not faults:

- **It needs no changeset.** It is the pull request that *consumes* them, so it
  changes five published packages and has none left. CI skips the changeset
  check for `changeset-release/*` branches.
- **CI does not run on it automatically.** GitHub does not trigger workflows for
  a pull request opened with the default `GITHUB_TOKEN`, to stop workflows
  recursing — it shows as `action_required`. Approve the run if you want it, or
  do not: the release job re-runs `yarn verify` before it publishes anything,
  precisely so publishing does not inherit trust from an earlier run. Making it
  run automatically means giving the bot a personal access token, which
  reintroduces the credential this setup exists to avoid.

A successful publish also creates a single `v0.1.0`-style tag and one GitHub
release covering all five packages. Changesets would otherwise tag and release
each package separately — five near-identical entries per version, and nothing
to link to when someone asks what is in a version.

The release is made with the `gh` CLI rather than an action: GitHub's own
`actions/create-release` has been archived since 2021, and `gh` is both
maintained and already present on the runner. It creates the tag itself when
one does not exist, which is just as well — changesets' `createGithubReleases`
flag also governs whether tags are pushed at all, so turning the per-package
releases off would otherwise have left no tags anywhere.

That step works out what to release from the repository, not from the
changesets action: the version comes from the manifests, the list of packages
from the `fixed` group in `.changeset/config.json`, and whether the release has
already been made from whether the tag exists. So a push to main that does not
bump the version is a no-op, and re-running a release that already tagged is
safe.

It used to be gated on the action's `published` output instead, and that is how
0.1.1 reached npm with no tag and no release, in a run that reported success.
The action derives `published` by regex-matching `New tag: <pkg>@<version>` out
of the publish script's stdout — a line changesets stopped printing in v3, which
reports `◇ Successfully published:` from a progress UI. Five packages went out
and the output still read `false`. Nothing in the workflow reads another tool's
console output any more.

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

It also refuses to publish anything still at `0.0.0`. That is the placeholder
these manifests carry until a release bumps them, so seeing it means the
version bump never reached the working tree — which is how five packages once
went out as `0.0.0`, with `latest` pointing at them, because npm sets `latest`
on a package's first publish whatever `--tag` says. Undoing it took an
unpublish inside npm's 72-hour window.

What it deliberately does not check is whether a version is already on the
registry. `changeset publish` skips those, and two things rely on it: the
no-op release run after a local publish, and re-running a release that failed
partway through its packages.

It also puts back any manifest left half-rewritten. Packing runs `prepack`,
which points `main` and `types` at `dist/`, and `postpack` swaps them back —
but only if the pack reaches the end. Since this runs locally as part of
`yarn release`, a pack that dies partway would otherwise leave a maintainer's
working tree pointing the repository's own entrypoints at gitignored build
output, and committing that breaks `yarn start` and the tests for everyone.

### First-time setup for a new package

npm cannot configure a trusted publisher for a package that does not exist yet
([npm/cli#8544](https://github.com/npm/cli/issues/8544)), so a brand-new
package cannot be published over OIDC. The first publish is therefore done
from a maintainer's machine, with a real 2FA prompt.

The alternative — a token with **Bypass two-factor authentication** enabled,
living in this repository's secrets — is what npm's own token page warns
against. It is a bearer credential worth exactly as much to an attacker as to
CI. Publishing locally removes the credential rather than guarding it.

1. Create the npm organisation matching the package scope, if it does not
   exist. `@brnby/x` needs an org named `brnby`; the free plan covers
   unlimited public packages.

2. Take the version bump by hand, since the bot's "chore: version packages"
   pull request would publish through CI and CI cannot authenticate yet.
   Close that pull request and run its work locally:

   ```bash
   git checkout main && git pull
   yarn version-packages
   ```

3. Log in. This prompts for username, password and the 2FA one-time password,
   and writes the token to your home folder — never into the project.

   ```bash
   yarn npm login
   ```

4. Publish. `changeset publish` asks for another one-time password if the
   account requires one for writes.

   ```bash
   yarn release
   ```

5. Commit the version bump and push. The Release workflow will run, find every
   version already on the registry, publish nothing and skip the release step.

   ```bash
   git add -A && git commit -m 'chore: version packages' && git push
   ```

6. Create the consolidated GitHub release, which the workflow skipped because
   it published nothing. `gh` creates the tag as well when one does not
   already exist:

   ```bash
   gh release create v0.1.0 --title v0.1.0 --notes-file <(
     awk '/^## /{ if (f) exit; if ($2 == "0.1.0") { f = 1; next } } f' \
       packages/colophon-common/CHANGELOG.md
   )
   ```

7. On npmjs.com, open each package's **Settings → Trusted publisher** and point
   it at this repository and `.github/workflows/release.yml`.

From then on every release runs from CI over OIDC, with a provenance
attestation linking the tarball to the commit and workflow that produced it,
and no credential anywhere to rotate or leak. Yarn performs the OIDC exchange
itself from 4.9.0 onwards; this repository pins 4.13.0.
