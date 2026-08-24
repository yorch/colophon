---
title: Configuration
description: Every Colophon app-config key, with defaults and whether it is required.
type: reference
tags: [configuration, reference]
---

# Configuration

All keys live under `colophon` in `app-config.yaml`. The backend ships a
config schema, so a key that is not on this page is a validation error
rather than a setting that quietly does nothing.

## Where the page is mounted

```yaml
colophon:
  appPath: /colophon
```

| Key | Required | Default | Notes |
| --- | --- | --- | --- |
| `appPath` | no | `/colophon` | Must match the `path` of the `page:colophon/colophon` extension |

Leave this alone unless you move the docs home page. If you do move it, this
key has to move with it:

```yaml
app:
  extensions:
    - page:colophon/colophon:
        config:
          path: /handbook

colophon:
  appPath: /handbook
```

`/handbook`, `handbook` and `/handbook/` are all accepted and mean the same
mount.

### The hazard, stated plainly

Two places name the mount, and only one of them is the truth. The frontend
resolves its own links through the plugin's route ref, so the portal keeps
working wherever the page is. **The backend has no router**: it builds every
Backstage Search result location and every URL handed to an agent over MCP
from `appPath` instead. Move the page and leave this key behind and nothing
fails at startup — the page renders, search returns results, agents answer
with citations, and every one of those links 404s.

Because that is invisible until something is clicked, the frontend compares
the two on load and warns in the browser console when they disagree, naming
both paths:

```text
Colophon: the docs page is mounted at "/handbook" but colophon.appPath is
"/colophon". The backend builds search result links and every URL it gives an
agent from colophon.appPath, so all of them will 404 until it is set to
"/handbook" in app-config.yaml.
```

Entity-scoped links are built from the catalog's own route
(`/catalog/<namespace>/<kind>/<name>/docs`) and are not affected by this key.
Moving the catalog plugin or the documentation tab is a separate problem that
`appPath` does not solve.

## The catalog annotation

Which annotation links a catalog entity to a documentation bundle.

```yaml
colophon:
  annotation: brnby.io/colophon
```

| Key | Required | Default | Notes |
| --- | --- | --- | --- |
| `annotation` | no | `brnby.io/colophon` | Read by the backend AND the frontend; both must agree |

Set this if your organisation namespaces its annotations and renaming them
across the whole catalog is not on the table:

```yaml
colophon:
  annotation: acme.example.com/docs
```

```yaml
# catalog-info.yaml
metadata:
  annotations:
    acme.example.com/docs: github.com/acme/payments-api
```

The value's own grammar is unchanged — `<bundleId>` or
`<bundleId>#<subpath>`. Only the key moves.

### The docs tab needs the filter moved too

The backend reads this key to build its entity-to-bundle table, and the
documentation tab reads it to find the bundle for the entity it is rendering.
Both follow the config. What does **not** follow it is the predicate that
decides whether the tab appears at all: that is the `filter` of an entity
content extension, which the frontend system evaluates without access to
config. Rename the annotation and the tab keeps testing for the old key, so
an annotated entity gets no tab and nothing says why.

Override the filter alongside the key:

```yaml
app:
  extensions:
    - entity-content:colophon/colophon:
        config:
          filter:
            metadata.annotations.acme.example.com/docs: { $exists: true }
```

An entity predicate object, not the older string expression — the string form
still works and logs a deprecation warning naming the extension.

Both halves, or neither — a rename that moves only one of them is a
half-working system rather than a broken one, which is harder to notice.

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
      prefix: colophon/
    local:
      directory: ./colophon-data
```

| Key | Required | Default | Notes |
| --- | --- | --- | --- |
| `storage.type` | no | `local` | `s3` or `local` |
| `storage.s3.bucket` | when `s3` | — | Startup fails without it |
| `storage.s3.region` | no | AWS SDK default | |
| `storage.s3.prefix` | no | — | Key prefix, so one bucket can hold more than Colophon |
| `storage.s3.endpoint` | no | AWS S3 | See below |
| `storage.s3.forcePathStyle` | no | `false` | See below |
| `storage.s3.credentials.accessKeyId` | no | AWS SDK provider chain | Marked secret |
| `storage.s3.credentials.secretAccessKey` | no | AWS SDK provider chain | Marked secret |
| `storage.local.directory` | no | `./colophon-storage` | Resolved against the backend's working directory. Development only |

### Credentials

Leave `credentials` unset and the AWS SDK's default provider chain applies —
environment, shared config file, instance role, IRSA. That is the right answer
for a deployment on AWS: no long-lived key material in `app-config.yaml` at
all. Both keys are declared `visibility: secret`, so if you do set them they
are redacted from logs and from `backstage-cli config:print`, and can never
reach the frontend.

### Anything S3-compatible, not only AWS

`endpoint` and `forcePathStyle` are passed straight to the AWS SDK client, so
**MinIO, Ceph RADOS Gateway, Cloudflare R2 and Google Cloud Storage** all work
as bundle storage. Most non-AWS endpoints need path-style addressing:

```yaml
colophon:
  storage:
    type: s3
    s3:
      bucket: colophon
      endpoint: http://minio.internal:9000
      forcePathStyle: true
      region: us-east-1
```

R2 wants its account endpoint and `region: auto`; GCS wants
`https://storage.googleapis.com` with its HMAC keys as the credentials.

### Do not put an age-based lifecycle rule on `blobs/`

Bundles are stored under two prefixes with different lifetimes:
`bundles/<bundleId>/revisions/<revisionId>/manifest.json` and
`blobs/<ab>/<sha256>`. Blobs are content-addressed and deduplicated — publish
skips the upload entirely when the key already exists — so an unchanged page's
object keeps the timestamp of the first revision that ever contained it, no
matter how many current revisions reference it. A rule such as "delete objects
older than 90 days" applied to `blobs/` therefore deletes live content while
every manifest still points at it, and nothing notices until a reader asks for
that page. Scope lifecycle rules to `bundles/` if you want them at all, and
reclaim blob storage through `retention.revisionsPerChannel` and garbage
collection instead.

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
    overlapChars: 0
```

| Key | Default | Notes |
| --- | --- | --- |
| `chunking.splitDepths` | `[2, 3]` | Heading depths (1-6) that start a chunk |
| `chunking.maxChars` | `1500` | Soft ceiling; long sections split on paragraphs |
| `chunking.minChars` | `200` | Shorter sections merge into the next sibling |
| `chunking.overlapChars` | `0` | Characters of the preceding chunk repeated for continuity |

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

Both entries take the platform's standard schedule shape, so `seconds`,
`minutes`, `hours` and `days` all work, as do an ISO 8601 duration string
(`PT30S`) and `frequency: { cron: '*/5 * * * *' }`. `scope` is accepted too.

`frequency` and `timeout` are required once you name a task at all —
`initialDelay` and `scope` are optional. A block missing one of the two is a
startup error rather than a silent completion from the defaults, which is how
a `frequency: { seconds: 30 }` that only `minutes` was ever read from went
unnoticed at ten minutes.

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
