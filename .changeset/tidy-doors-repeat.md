---
'@brnby/colophon-common': patch
'@brnby/colophon-cli': patch
'@brnby/plugin-colophon': patch
'@brnby/plugin-colophon-react': patch
'@brnby/plugin-colophon-backend': patch
---

Documentation only: the install instructions no longer ask for the `next`
dist-tag. Releases go out under `latest` now, and `next` has been removed from
the registry, so `@brnby/…@next` does not resolve at all — every package README
told a reader to install a tag that is gone. npm ships README.md in the tarball
whatever `files` says, so this reaches the registry page as well as the
repository.

The replacements name no version number. A sentence that hardcodes one is what
went stale here in the first place; "under `latest`" stays true across releases.
