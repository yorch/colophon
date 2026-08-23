---
title: CLI reference
description: Every colophon command — publishing, validating, retiring, and collecting garbage.
type: reference
tags: [cli, operations, publishing]
---

# CLI reference

`@brnby/colophon-cli` is what CI runs. It writes to object storage directly
and talks to the Backstage backend over HTTP; publishing is two steps for that
reason, and so is retiring.

```bash
npx @brnby/colophon-cli publish ./docs --bundle-id github.com/org/repo
```

## Storage flags

Shared by `publish` and `gc`, which must address the same objects. An
`--s3-prefix` applied on one side only means a sweep that reports the whole
corpus as unreferenced.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--storage <kind>` | `local` | `local` or `s3` |
| `--local-dir <path>` | `./colophon-storage` | Root directory when `--storage local` |
| `--s3-bucket <name>` | — | Required when `--storage s3` |
| `--s3-region <name>` | — | Bucket region |
| `--s3-prefix <path>` | — | Key prefix; must match `colophon.storage.s3.prefix` |
| `--s3-endpoint <url>` | — | Custom endpoint, for MinIO, R2 and similar |
| `--s3-force-path-style` | off | Path-style addressing, for MinIO |

## `colophon validate <docsDir>`

Runs the same scan and validation as `publish` and uploads nothing. A
reasonable pre-commit hook.

| Flag | Meaning |
| --- | --- |
| `--strict` | Promote advisories to errors |

## `colophon publish <docsDir>`

Builds a revision, uploads its blobs and manifest, then — given
`--backend-url` — registers it and points a channel at it.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--bundle-id <id>` | required | Bundle identifier, e.g. `github.com/org/repo` |
| `--channel <name>` | `latest` | Channel to point at this revision |
| `--backend-url <url>` | — | Backstage backend; without it, nothing is registered |
| `--token <token>` | — | Bearer token carrying `colophon.docs.publish` |
| `--source-url`, `--source-ref`, `--source-commit`, `--source-path` | — | Provenance recorded in the manifest |
| `--publisher <name>`, `--run-url <url>` | `colophon-cli` | Who published, and a link back to the run |
| `--strict` | off | Promote advisories to errors |
| `--dry-run` | off | Build and validate, upload nothing |

## `colophon delete-channel <bundleId> <channel>`

Retires a channel. The channel stops resolving immediately; the revisions it
pinned become collectable and fall under the ordinary retention window.

Refuses the bundle's **default channel** — the one a bare docs URL resolves
to. Removing it alone would leave the bundle listed everywhere and resolvable
by nothing. Repoint the default first, or retire the whole bundle.

| Flag | Meaning |
| --- | --- |
| `--backend-url <url>` | Required |
| `--token <token>` | Bearer token carrying `colophon.docs.publish` |

An unknown bundle or channel is a 404 rather than a silent success: a bundle
id is a repository name typed by hand, and a typo answered with "done" is how
you come to believe you retired something you did not.

## `colophon delete-bundle <bundleId>`

Retires a bundle outright — every channel, revision, page and chunk. This is
what removes a decommissioned repository from the docs home and from search.

| Flag | Meaning |
| --- | --- |
| `--backend-url <url>` | Required |
| `--token <token>` | Bearer token carrying `colophon.docs.publish` |

It does not touch object storage. Run `colophon gc` for that.

## `colophon gc`

Reports objects no retained revision references any more, and — only with
`--confirm` — deletes them.

```text
$ colophon gc --backend-url https://backstage.example.com --s3-bucket docs
  scanning 4 bundles, 12 revisions
  reachable blobs:    1,847
  unreferenced:          63  (18.4 MB)
  DRY RUN — nothing deleted
  re-run with --confirm
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--backend-url <url>` | required | Backstage backend, asked what is still retained |
| `--token <token>` | — | Bearer token carrying `colophon.docs.publish` |
| `--confirm` | off | Actually delete what the sweep found |
| `--min-age-hours <hours>` | `24` | Leave objects younger than this alone |

### Why it needs the backend

Blobs are content-addressed into **one flat namespace shared by every
bundle** — `blobs/<ab>/<sha256>`. Two repositories with the same LICENSE file
have one object between them. Reachability therefore cannot be computed per
bundle; the sweep unions the referenced set across every retained revision of
every bundle, and only then considers what is left.

What is *retained* is a database question, not a bucket one. Retention keeps a
window of revisions no channel points at so a rollback has something to roll
back to, and their content must survive. A collector reading the bucket alone
would either keep everything forever or delete exactly what retention exists
to preserve.

### Ordering and safety

- **Dry run by default.** `--confirm` is the only thing that deletes.
- Blobs are listed **before** the retained set is fetched, so anything
  uploaded after the sweep starts is invisible to it and safe.
- `--min-age-hours` covers the window between a publish uploading its manifest
  and registering the revision. Set it to `0` only when nothing is publishing.
- Manifests are deleted before blobs. An interrupted sweep then leaves blobs
  nothing points at — which the next run collects — rather than a manifest
  pointing at content that is already gone.

One window is left open: a publish that re-uses an old blob it did not have to
upload, for a revision registered after the sweep read the retained set. Run
`gc` when publishing is quiet.

### Credentials

`gc` is the only command that deletes from object storage, and deliberately so
— the backend is expected to hold **read-only** bucket credentials. Give the
collector a role that can list and delete under `blobs/` and `bundles/`.
