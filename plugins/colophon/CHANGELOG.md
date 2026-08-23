# @brnby/plugin-colophon

## 0.3.0

### Minor Changes

- [#26](https://github.com/yorch/colophon/pull/26) [`bf13941`](https://github.com/yorch/colophon/commit/bf1394154c22f424f708f095c9ec7322f8d8a034) Thanks [@yorch](https://github.com/yorch)! - Adopter `link` and `image` overrides now win.
  
  `DocsBrowser` installed its reference-resolving `link` and `image` components
  as the innermost provider, so an app's overrides for those two slots were
  always shadowed — five of the seven slots were overridable and two silently
  were not. Colophon now fills those slots only when the app has not claimed
  them, and exports `useColophonReference` so an override that does claim one can
  still resolve relative links, anchors and assets the way the built-in
  components do.
  
  Also fixes two design tokens that do not exist in `@backstage/ui`:
  `--bui-fg-link` and `--bui-bg-surface-1`. The first left the bundle row with no
  visible focus indicator, which is an accessibility defect — `var()` with no
  fallback resolves to nothing and drops the declaration silently. A test now
  checks every `--bui-*` name in the stylesheet against the stylesheet
  `@backstage/ui` ships.
  
  `ensureColophonStyles` and `COLOPHON_STYLE_ELEMENT_ID` are now exported, making
  the documented stylesheet opt-out a supported API.

### Patch Changes

- Updated dependencies [[`bf13941`](https://github.com/yorch/colophon/commit/bf1394154c22f424f708f095c9ec7322f8d8a034)]:
  - @brnby/plugin-colophon-react@0.3.0
  - @brnby/colophon-common@0.3.0

## 0.2.0

### Patch Changes

- [#21](https://github.com/yorch/colophon/pull/21) [`f689eb1`](https://github.com/yorch/colophon/commit/f689eb1586d8908e4a7f9d2ebd453f5d009d109f) Thanks [@yorch](https://github.com/yorch)! - Resolve the docs home page's own links through its route ref instead of a
  hardcoded `/colophon`. `PageBlueprint` takes `path` from config, so an app that
  mounts the page anywhere else — `page:colophon/colophon` with `path: /handbook`
  — got a page whose bundle rows and "All documentation" link both 404'd.

- [#24](https://github.com/yorch/colophon/pull/24) [`adfda81`](https://github.com/yorch/colophon/commit/adfda8169e6c201eba06fd2f2a43f0da7a8ae83c) Thanks [@yorch](https://github.com/yorch)! - Build backend links from a new `colophon.appPath` config key instead of a
  hardcoded `/colophon`. The frontend fix for this shipped as a route ref, which
  the backend cannot use: it has no router, and it is the half that writes every
  Backstage Search result location and every URL handed to an agent over MCP. An
  app that moved the page with `page:colophon/colophon` had all of them 404.
  
  Because a second copy of a value drifts silently, the frontend now compares the
  route ref's resolved path against `colophon.appPath` on mount and warns in the
  console when they disagree, naming both paths. The key is declared
  `@visibility frontend` so the browser can read it.
- Updated dependencies [[`adfda81`](https://github.com/yorch/colophon/commit/adfda8169e6c201eba06fd2f2a43f0da7a8ae83c), [`2c4ec7d`](https://github.com/yorch/colophon/commit/2c4ec7d90198bfaa50005af8beb05ed7951655a1)]:
  - @brnby/colophon-common@0.2.0
  - @brnby/plugin-colophon-react@0.2.0

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
- Updated dependencies [[`e1617cf`](https://github.com/yorch/colophon/commit/e1617cf1293fa666088fab4ed4549852ebb126f2)]:
  - @brnby/plugin-colophon-react@0.1.1
  - @brnby/colophon-common@0.1.1

## 0.1.0

### Minor Changes

- [#2](https://github.com/yorch/colophon/pull/2) [`5e0bd31`](https://github.com/yorch/colophon/commit/5e0bd3134c455383127af513979bb0f5d82225ba) Thanks [@yorch](https://github.com/yorch)! - First release. Colophon publishes a repository's `docs/` tree as Markdown and
  serves it two ways from one source: rendered in the Backstage portal, and
  exposed as MCP tools for coding agents.
  
  Published under the `next` dist-tag while the bundle contract settles.
  
  Adds the `backstage.pluginPackages` metadata the plugin packages were missing,
  without which `prepack` refuses to run and the packages cannot be published at
  all.

### Patch Changes

- Updated dependencies [[`5e0bd31`](https://github.com/yorch/colophon/commit/5e0bd3134c455383127af513979bb0f5d82225ba)]:
  - @brnby/plugin-colophon-react@0.1.0
  - @brnby/colophon-common@0.1.0
