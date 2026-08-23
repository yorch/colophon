---
---

Project site only — no published package changes, so this is deliberately empty
rather than skipped.

The getting-started page shipped a `colophon.schedule` sample that predates the
split into `entityLinks` and `searchIndex`, which the config schema added in #23
now rejects at startup; it is corrected against `config.d.ts` and
`app-config.colophon.yaml`, along with three wrong cells in the config table. The
site also now links to `docs/` on GitHub, which the Pages workflow never deployed
and nothing on the site pointed at. The `site/BUILD-OPTIONS.md` memo moved to
`SITE-BUILD-OPTIONS.md` so GitHub Pages stops serving it.
