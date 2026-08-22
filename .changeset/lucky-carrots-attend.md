---
'@brnby/plugin-colophon-backend': minor
'@brnby/plugin-colophon-react': minor
'@brnby/colophon-common': minor
'@brnby/plugin-colophon': minor
'@brnby/colophon-cli': minor
---

First release. Colophon publishes a repository's `docs/` tree as Markdown and
serves it two ways from one source: rendered in the Backstage portal, and
exposed as MCP tools for coding agents.

Published under the `next` dist-tag while the bundle contract settles.

Adds the `backstage.pluginPackages` metadata the plugin packages were missing,
without which `prepack` refuses to run and the packages cannot be published at
all.
