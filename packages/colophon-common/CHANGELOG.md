# @brnby/colophon-common

## 0.3.0

## 0.2.0

### Minor Changes

- [#25](https://github.com/yorch/colophon/pull/25) [`2c4ec7d`](https://github.com/yorch/colophon/commit/2c4ec7d90198bfaa50005af8beb05ed7951655a1) Thanks [@yorch](https://github.com/yorch)! - Add deletion and garbage collection. Nothing could previously be retired:
  `ColophonDatabase.deleteChannel` and `deleteRevisions` had no callers, so a
  `pr-42`-channel-per-pull-request workflow accumulated channels, revisions,
  pages and chunks forever, and the docs home listed every decommissioned
  repository until someone ran SQL by hand.
  
  - `DELETE /bundles/:bundleId/channels/:channel` and `DELETE /bundles/:bundleId`,
    both behind `colophon.docs.publish`. They act immediately; the permission
    check is the gate. Deleting the bundle's default channel on its own is
    refused with 409 — it would leave a bundle listed everywhere and resolvable
    by nothing.
  - `GET /revisions` reports every retained revision, which is what a collector
    needs and cannot derive from the bundle list.
  - `colophon delete-channel`, `colophon delete-bundle`, and `colophon gc`.
  - `colophon gc` is **dry run by default**: it reports counts and bytes and
    exits. `--confirm` performs the sweep.
  
  Blobs are content-addressed into one flat namespace shared by every bundle, so
  `gc` unions the referenced set across every retained revision of every bundle
  before considering anything unreferenced — a per-bundle computation would
  delete the other repository's live content.
  
  `BundleStorage` in `@brnby/colophon-cli` gains `list` and `delete`, which is
  breaking for anyone who implemented that interface themselves. The backend's
  own storage interface is unchanged and still read-only.

### Patch Changes

- [#24](https://github.com/yorch/colophon/pull/24) [`adfda81`](https://github.com/yorch/colophon/commit/adfda8169e6c201eba06fd2f2a43f0da7a8ae83c) Thanks [@yorch](https://github.com/yorch)! - Build backend links from a new `colophon.appPath` config key instead of a
  hardcoded `/colophon`. The frontend fix for this shipped as a route ref, which
  the backend cannot use: it has no router, and it is the half that writes every
  Backstage Search result location and every URL handed to an agent over MCP. An
  app that moved the page with `page:colophon/colophon` had all of them 404.
  
  Because a second copy of a value drifts silently, the frontend now compares the
  route ref's resolved path against `colophon.appPath` on mount and warns in the
  console when they disagree, naming both paths. The key is declared
  `@visibility frontend` so the browser can read it.

## 0.1.1

### Patch Changes

- [#7](https://github.com/yorch/colophon/pull/7) [`e1617cf`](https://github.com/yorch/colophon/commit/e1617cf1293fa666088fab4ed4549852ebb126f2) Thanks [@yorch](https://github.com/yorch)! - Give each published package its own README, LICENSE and npm metadata.
  
  Only the repository root had a README, and npm renders the README it finds in
  the tarball — so all five package pages were blank, with no repository link, no
  link to the documentation site, and nothing to find them by in search.
  
  Each package now carries a README written for someone landing on its npm page
  rather than on the repository, plus `repository` (with the `directory` field
  that makes npm link into the right subdirectory), `homepage`, `bugs` and
  keywords.

## 0.1.0

### Minor Changes

- [#2](https://github.com/yorch/colophon/pull/2) [`5e0bd31`](https://github.com/yorch/colophon/commit/5e0bd3134c455383127af513979bb0f5d82225ba) Thanks [@yorch](https://github.com/yorch)! - First release. Colophon publishes a repository's `docs/` tree as Markdown and
  serves it two ways from one source: rendered in the Backstage portal, and
  exposed as MCP tools for coding agents.
  
  Published under the `next` dist-tag while the bundle contract settles.
  
  Adds the `backstage.pluginPackages` metadata the plugin packages were missing,
  without which `prepack` refuses to run and the packages cannot be published at
  all.
