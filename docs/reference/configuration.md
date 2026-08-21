---
title: Configuration
description: Every Colophon app-config key, with defaults and whether it is required.
type: reference
tags: [configuration, reference]
---

# Configuration

All keys live under `colophon` in `app-config.yaml`.

## Storage

Where published bundles are read from. The backend needs read-only access;
CI needs write.

```yaml
colophon:
  storage:
    type: s3          # s3 | local
    s3:
      bucket: my-colophon-bucket
      region: eu-west-1
    local:
      directory: ./colophon-data
```

| Key | Required | Default | Notes |
| --- | --- | --- | --- |
| `storage.type` | yes | — | `s3` or `local` |
| `storage.s3.bucket` | when `s3` | — | |
| `storage.s3.region` | when `s3` | AWS SDK default | |
| `storage.local.directory` | when `local` | — | Development only |

## Retention

```yaml
colophon:
  retention:
    revisionsPerChannel: 10
```

Revisions a channel points at are never collected. Beyond those, the most
recent `revisionsPerChannel` per channel are kept and the rest are eligible
for garbage collection.

## Chunking

Applied at index time, so changing these values re-chunks on the next index
run without any repository re-running CI.

```yaml
colophon:
  chunking:
    splitDepths: [2, 3]
    maxChars: 1500
    minChars: 200
```

| Key | Default | Notes |
| --- | --- | --- |
| `chunking.splitDepths` | `[2, 3]` | Heading depths that start a chunk |
| `chunking.maxChars` | `1500` | Soft ceiling; long sections split on paragraphs |
| `chunking.minChars` | `200` | Shorter sections merge into the next sibling |

## Indexing schedule

```yaml
colophon:
  schedule:
    frequency: { minutes: 10 }
    timeout: { minutes: 15 }
```

## MCP

Colophon registers its actions with the Actions Registry; exposure is
configured in the MCP Actions Backend rather than here.

```yaml
backend:
  actions:
    pluginSources: [colophon, catalog]

mcpActions:
  servers:
    colophon:
      name: Colophon Documentation
      filter:
        include:
          - id: 'colophon:*'
```
