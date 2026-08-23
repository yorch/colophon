---
'@brnby/plugin-colophon': patch
---

Resolve the docs home page's own links through its route ref instead of a
hardcoded `/colophon`. `PageBlueprint` takes `path` from config, so an app that
mounts the page anywhere else — `page:colophon/colophon` with `path: /handbook`
— got a page whose bundle rows and "All documentation" link both 404'd.
