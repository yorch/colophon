---
---

Release tooling only, so no package changes and no version bump: the `release`
script no longer passes `--tag next`, the release job reads the version it is
releasing from the commit rather than from a working tree the version script
may have bumped, and it now fails when the `latest` dist-tag does not point at
the version just released.

The published packages are untouched. What changes is where the *next* release
lands — `latest` rather than `next` — which commit its tag is pinned to, and
that the pipeline now notices when either goes wrong. The versions already on
npm still need `npm dist-tag add` by hand; CI cannot move a tag on a version
that is already published.
