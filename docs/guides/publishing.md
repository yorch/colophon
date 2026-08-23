---
title: Publishing documentation
description: Add a CI step that publishes a repository's docs directory as a Colophon bundle.
type: how-to
tags: [ci, publishing]
---

# Publishing documentation

## Link the entity to a bundle

Add the annotation to `catalog-info.yaml`:

```yaml
metadata:
  annotations:
    brnby.io/colophon: github.com/brnby/payments-api
```

For a monorepo where several components share one `docs/` tree, scope each
entity to a subtree with the `#` form:

```yaml
    brnby.io/colophon: github.com/brnby/platform#services/billing
```

Both shapes are supported: one shared bundle referenced by many entities, or
one bundle per component published separately from the same repository.

## Publish from CI

```yaml
- name: Publish documentation
  run: |
    npx @brnby/colophon-cli publish ./docs \
      --bundle-id "github.com/${{ github.repository }}" \
      --channel latest \
      --storage s3 \
      --s3-bucket "$COLOPHON_BUCKET"
```

## Release branches

Map a release branch onto a channel. The default channel is what a bare docs
URL resolves to; other channels stay reachable through the version picker and
through `colophon:search` with an explicit `channel` filter.

```yaml
    --channel ${{ github.ref_name == 'main' && 'latest' || github.ref_name }}
```

## Retire what you opened

A `pr-42` channel per pull request accumulates forever unless something closes
it. Close it from the same workflow that opened it:

```yaml
- name: Retire the preview channel
  if: github.event.action == 'closed'
  run: |
    npx @brnby/colophon-cli delete-channel \
      "github.com/${{ github.repository }}" "pr-${{ github.event.number }}" \
      --backend-url "$COLOPHON_BACKEND" --token "$COLOPHON_TOKEN"
```

Deleting a channel unpins the revisions it held; retention collects them once
they fall outside its window. A revision a second channel still points at is
untouched.

For a decommissioned repository, `colophon delete-bundle <bundleId>` removes
every channel, revision, page and chunk, which is what takes it out of the
docs home and out of search. The default channel cannot be deleted on its own
— a bundle nothing resolves against is listed everywhere and readable nowhere.

Neither command touches object storage. `colophon gc` reclaims that, and it
reports before it deletes:

```bash
colophon gc --backend-url "$COLOPHON_BACKEND" --token "$COLOPHON_TOKEN" \
  --storage s3 --s3-bucket "$COLOPHON_BUCKET"
```

Blobs are shared by every bundle in the deployment — two repositories with the
same LICENSE file store one object — so `gc` computes reachability across the
whole corpus rather than per bundle. See the [CLI reference](../reference/cli.md)
for the flags and the safety rules.

## Verify before you push

`colophon validate ./docs` runs the same scan and validation as `publish`
without uploading anything. It is a good pre-commit hook.

Errors always fail the run. Advisories — a missing description, a page missing
from the nav, no landing page, an exclude pattern that matches nothing — are
reported and tolerated, unless you pass `--strict`, which promotes all of them
to errors. Adopt `--strict` once your docs are clean; it is the difference
between a warning nobody reads and a gate.
