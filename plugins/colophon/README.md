# @brnby/plugin-colophon

The Colophon frontend plugin for Backstage: a **Docs** tab on any catalog
entity that has documentation, a cross-repository docs home page, and
documentation as a first-class result type in portal search.

Install it in a Backstage app whose backend runs
[`@brnby/plugin-colophon-backend`](https://www.npmjs.com/package/@brnby/plugin-colophon-backend).
It renders Markdown published by
[`@brnby/colophon-cli`](https://www.npmjs.com/package/@brnby/colophon-cli), in
the portal, themed with Backstage UI — no shadow DOM and no CSS patching of
someone else's generated HTML.

**[Documentation](https://yorch.github.io/colophon/)** ·
**[Getting started](https://yorch.github.io/colophon/getting-started.html)** ·
**[Repository](https://github.com/yorch/colophon)**

## Install

```bash
yarn workspace app add @brnby/plugin-colophon
```

Releases go out under both the `latest` and `next` dist-tags; both currently
point at `0.1.0`.

This is a **New Frontend System** plugin, and a default export.
`packages/app/src/App.tsx`:

```tsx
import colophonPlugin from '@brnby/plugin-colophon';

const app = createApp({ features: [colophonPlugin] });
```

That is the whole installation. The plugin brings its own extensions: the API
client, the entity content tab, the docs home page and its sidebar entry, and
the two search extensions.

## Linking an entity to its docs

A component gets a **Docs** tab when it carries the annotation. The tab is
filtered on it, so entities without documentation do not grow an empty tab:

```yaml
metadata:
  annotations:
    brnby.io/colophon: github.com/org/repo
    # Or, for one shared docs tree serving several components in a monorepo:
    # brnby.io/colophon: github.com/org/platform#services/billing
```

The subpath form scopes the tab to a subtree of a single bundle, so a monorepo
publishes its `docs/` once and each component shows only its own part of it.

## Search

Two extensions, answering two different questions. A result-type filter puts
"Documentation" beside "Software Catalog" in the search filter panel — without
it, docs are searchable but cannot be searched *for*. A result list item then
renders a hit as a *section* of a page, with its heading breadcrumb, rather
than an anonymous blob of text.

Both depend on the backend's search collator being installed; see the backend
package.

## Also exported

`DocsBrowser`, the page-and-navigation component behind both the entity tab and
the docs home, if you want to place documentation somewhere else in your app;
`colophonApiRef` and `ColophonClient`, the typed client for `/api/colophon`;
`colophonRouteRef`, for deep links; and `isColophonAvailable` / `readBundleRef`
for reading the annotation yourself.

Rendering itself lives in
[`@brnby/plugin-colophon-react`](https://www.npmjs.com/package/@brnby/plugin-colophon-react),
which is where component overrides are registered.

## Status

Early development. The bundle contract is not yet stable and may change without
a `schemaVersion` bump.

## License

[MIT](LICENSE) © Jorge Barnaby
