# @brnby/colophon-cli

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
  - @brnby/colophon-common@0.1.0
