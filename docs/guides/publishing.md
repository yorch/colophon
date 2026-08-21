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

## Verify before you push

`colophon validate ./docs` runs the same scan and validation as `publish`
without uploading anything. It is a good pre-commit hook.

Errors always fail the run. Advisories — a missing description, a page missing
from the nav, no landing page, an exclude pattern that matches nothing — are
reported and tolerated, unless you pass `--strict`, which promotes all of them
to errors. Adopt `--strict` once your docs are clean; it is the difference
between a warning nobody reads and a gate.
