---
---

Release tooling only, so no package changes and no version bump: the `release`
script no longer passes `--tag next`, and the release workflow now fails when
the `latest` dist-tag does not point at the version it just released.

The published packages are untouched. What changes is where the *next* release
lands — `latest` rather than `next` — and that the pipeline now notices when it
does not. The versions already on npm still need `npm dist-tag add` by hand;
CI cannot move a tag on a version that is already published.
