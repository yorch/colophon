---
'@brnby/plugin-colophon-backend': patch
'@brnby/plugin-colophon-react': patch
'@brnby/colophon-common': patch
'@brnby/plugin-colophon': patch
'@brnby/colophon-cli': patch
---

Give each published package its own README, LICENSE and npm metadata.

Only the repository root had a README, and npm renders the README it finds in
the tarball — so all five package pages were blank, with no repository link, no
link to the documentation site, and nothing to find them by in search.

Each package now carries a README written for someone landing on its npm page
rather than on the repository, plus `repository` (with the `directory` field
that makes npm link into the right subdirectory), `homepage`, `bugs` and
keywords.
