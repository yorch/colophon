# @brnby/colophon-common

## 0.1.0

### Minor Changes

- [#2](https://github.com/yorch/colophon/pull/2) [`5e0bd31`](https://github.com/yorch/colophon/commit/5e0bd3134c455383127af513979bb0f5d82225ba) Thanks [@yorch](https://github.com/yorch)! - First release. Colophon publishes a repository's `docs/` tree as Markdown and
  serves it two ways from one source: rendered in the Backstage portal, and
  exposed as MCP tools for coding agents.
  
  Published under the `next` dist-tag while the bundle contract settles.
  
  Adds the `backstage.pluginPackages` metadata the plugin packages were missing,
  without which `prepack` refuses to run and the packages cannot be published at
  all.
