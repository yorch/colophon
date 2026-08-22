# @brnby/plugin-colophon-backend

The Colophon backend plugin for Backstage: bundle storage, the revision and
channel index, chunking, the HTTP API the frontend reads, a search collator,
and the MCP actions that expose documentation to coding agents.

Install it in a Backstage backend that should serve documentation published by
[`@brnby/colophon-cli`](https://www.npmjs.com/package/@brnby/colophon-cli). It
is the only one of the Colophon packages that talks to object storage and to
the database.

**[Documentation](https://yorch.github.io/colophon/)** ·
**[Architecture](https://yorch.github.io/colophon/architecture.html)** ·
**[Repository](https://github.com/yorch/colophon)**

## Install

```bash
yarn workspace backend add @brnby/plugin-colophon-backend
```

Releases go out under both the `latest` and `next` dist-tags; both currently
point at `0.1.0`.

`packages/backend/src/index.ts`:

```ts
import { searchModuleColophonCollator } from '@brnby/plugin-colophon-backend';

backend.add(import('@brnby/plugin-colophon-backend'));

// Only if you want documentation in portal-wide Backstage Search.
backend.add(searchModuleColophonCollator);
```

The collator is a named export of the package's single entry point, not an
`/alpha` subpath — this package declares no `exports` map, so a subpath import
does not resolve. It is added with a static import because `backend.add` takes
a feature or a promise of a module *namespace*, not a promise of a feature.

## Configuration

Storage is the only required section. Merge
[`app-config.colophon.yaml`](https://github.com/yorch/colophon/blob/main/app-config.colophon.yaml)
into your `app-config.yaml`; every key is documented under
[configuration](https://yorch.github.io/colophon/getting-started.html).

```yaml
colophon:
  storage:
    type: s3
    s3:
      bucket: ${COLOPHON_BUCKET}
      region: ${AWS_REGION}
```

Two schedules run on top of that: one re-reads the catalog for
`brnby.io/colophon` annotations (cheap, wants to run often — until it does, a
newly annotated entity has no documentation tab), and one projects
documentation into Backstage Search (expensive, wants to run rarely).

## What it does

Object storage holds the immutable, content-addressed content. The database
holds the small relational index that is constantly queried: manifests,
navigation, chunks, channels and full-text. Only channel-pointed revisions are
indexed, and only the default channel projects into portal search — otherwise
the search box returns the same page once per version.

Chunking is applied at *index* time rather than publish time, so changing
`colophon.chunking` re-chunks the corpus on the next run without any repository
re-running its CI.

The plugin owns `/api/colophon`: listing bundles, resolving a manifest for a
channel, reading a page or asset, registering a revision (what the CLI's
`--backend-url` calls), and search. Reads are authorized against catalog
visibility, so a user only sees documentation for entities they can already
see.

## For agents

Four read-only actions are registered with Backstage's Actions Registry, which
the [MCP Actions Backend](https://backstage.io/docs/ai/mcp-actions/) exposes to
any MCP client:

| Action | Returns |
| --- | --- |
| `colophon:search` | Ranked page *sections*, with heading breadcrumbs and citable URLs |
| `colophon:get-page` | A whole page, as Markdown |
| `colophon:list-pages` | The navigation tree, so an agent can orient before searching |
| `colophon:list-entities` | Which catalog entities have documentation |

They return Markdown rather than HTML, which is the payoff of keeping Markdown
as the stored artifact.

## Also exported

`colophonPermissions` and the two permission refs, for wiring a permission
policy; `DefaultColophonCollatorFactory`, if you want to register the collator
yourself instead of using the module; and `readColophonConfig`.

## Status

Early development. The bundle contract is not yet stable and may change without
a `schemaVersion` bump.

## License

[MIT](LICENSE) © Jorge Barnaby
