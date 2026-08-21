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

## Schedules

Two, because the work is not comparable. They were one key until it became
clear that a value suiting either badly misfits the other.

```yaml
colophon:
  schedule:
    entityLinks:
      frequency: { minutes: 10 }
      timeout: { minutes: 5 }
      initialDelay: { seconds: 15 }
    searchIndex:
      frequency: { minutes: 60 }
      timeout: { minutes: 30 }
      initialDelay: { seconds: 60 }
```

| Task | Cost | Guidance |
| --- | --- | --- |
| `entityLinks` | One filtered catalog query and a small table rewrite | Run often — until it runs, a newly annotated entity has no documentation tab |
| `searchIndex` | Pages the entire corpus over HTTP | Run rarely |

Note that neither of these is ingestion. A published revision is ingested
synchronously when a channel is pointed at it, not on a schedule.

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

## Permissions

Colophon defines two permissions and enforces them across the HTTP routes,
the MCP actions, and portal search alike — so a rule written once holds
everywhere rather than covering only whichever surface you tested.

| Permission | Guards |
| --- | --- |
| `colophon.docs.read` | Reading documentation, anywhere |
| `colophon.docs.publish` | Registering a revision and repointing a channel |

### The default

With no permission policy installed, Backstage allows everything, so
documentation is readable by every authenticated user. That is the same
default TechDocs has, and it is almost certainly what you want on day one.

### Following catalog visibility

Per-entity visibility is delegated to the catalog rather than re-decided
here. When a bundle is linked to a catalog entity, the backend asks the
catalog — with the caller's own credentials — whether that entity is
visible. If it is not, the documentation is reported as not found.

This means "documentation is as visible as the component it documents" is
already true, without a policy of your own, and it cannot drift from what
the catalog itself would answer.

A bundle that no entity references has nothing to delegate to, and is
governed by `colophon.docs.read` alone. Denying those by default would make
the plugin appear broken whenever documentation is published before its
catalog entry lands.

### Restricting further

```ts
if (isPermission(request.permission, colophonDocsReadPermission)) {
  return { result: AuthorizeResult.DENY };
}
```

To keep publishing to CI alone, deny `colophon.docs.publish` for user
principals and grant it to the service identity your pipeline uses.

### Why a hidden bundle reports "not found"

Distinguishing "exists but you may not see it" from "does not exist" would
tell an unauthorised caller which bundle ids are real — and a bundle id is a
repository name.
