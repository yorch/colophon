---
'@brnby/plugin-colophon-backend': minor
'@brnby/colophon-common': minor
'@brnby/colophon-cli': minor
---

Add deletion and garbage collection. Nothing could previously be retired:
`ColophonDatabase.deleteChannel` and `deleteRevisions` had no callers, so a
`pr-42`-channel-per-pull-request workflow accumulated channels, revisions,
pages and chunks forever, and the docs home listed every decommissioned
repository until someone ran SQL by hand.

- `DELETE /bundles/:bundleId/channels/:channel` and `DELETE /bundles/:bundleId`,
  both behind `colophon.docs.publish`. They act immediately; the permission
  check is the gate. Deleting the bundle's default channel on its own is
  refused with 409 — it would leave a bundle listed everywhere and resolvable
  by nothing.
- `GET /revisions` reports every retained revision, which is what a collector
  needs and cannot derive from the bundle list.
- `colophon delete-channel`, `colophon delete-bundle`, and `colophon gc`.
- `colophon gc` is **dry run by default**: it reports counts and bytes and
  exits. `--confirm` performs the sweep.

Blobs are content-addressed into one flat namespace shared by every bundle, so
`gc` unions the referenced set across every retained revision of every bundle
before considering anything unreferenced — a per-bundle computation would
delete the other repository's live content.

`BundleStorage` in `@brnby/colophon-cli` gains `list` and `delete`, which is
breaking for anyone who implemented that interface themselves. The backend's
own storage interface is unchanged and still read-only.
