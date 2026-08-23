---
'@brnby/plugin-colophon-backend': patch
'@brnby/colophon-common': patch
'@brnby/plugin-colophon': patch
---

Build backend links from a new `colophon.appPath` config key instead of a
hardcoded `/colophon`. The frontend fix for this shipped as a route ref, which
the backend cannot use: it has no router, and it is the half that writes every
Backstage Search result location and every URL handed to an agent over MCP. An
app that moved the page with `page:colophon/colophon` had all of them 404.

Because a second copy of a value drifts silently, the frontend now compares the
route ref's resolved path against `colophon.appPath` on mount and warns in the
console when they disagree, naming both paths. The key is declared
`@visibility frontend` so the browser can read it.
