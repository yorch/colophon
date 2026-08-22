# @brnby/colophon-common

The Colophon bundle contract: the manifest schema, the identifier rules, the
object-storage key layout, and the retrieval chunk shape. Everything the
publisher CLI, the Backstage backend and the frontend have to agree on lives
here — and nothing else does.

You need this package directly only if you are writing something that produces
or reads Colophon bundles yourself: a publisher other than
`@brnby/colophon-cli`, a migration script, a tool that inspects a bucket.
Installing the CLI or either plugin already brings it in.

**[Documentation](https://yorch.github.io/colophon/)** ·
**[Repository](https://github.com/yorch/colophon)**

## Install

```bash
yarn add @brnby/colophon-common
```

Releases go out under both the `latest` and `next` dist-tags; both currently
point at `0.1.0`.

## Usage

There is no client and no I/O — everything is a pure function or a zod schema.

```ts
import {
  blobKey,
  manifestKey,
  parseBundleRef,
  parseManifest,
} from '@brnby/colophon-common';

// Throws a zod error, with the offending path, if this is not a manifest.
const manifest = parseManifest(JSON.parse(json));

// Where the manifest lives, and where each page body lives.
manifestKey(manifest.bundleId, manifest.revisionId);
for (const page of manifest.pages) {
  console.log(page.slug, blobKey(page.contentHash));
}

// The catalog annotation an entity uses to claim a bundle, or a subtree of one.
parseBundleRef('github.com/org/repo#services/billing');
// → { bundleId: 'github.com/org/repo', subpath: 'services/billing' }
```

## What is in it

| Exports | What they decide |
| --- | --- |
| `manifestSchema`, `parseManifest`, `Manifest` | The manifest — a *complete* index of a revision, so a consumer can build navigation, a table of contents and link validation without reading a single page body |
| `bundleIdSchema`, `channelSchema`, `normalizeSlug`, `slugFromPath` | Identity: what a bundle id may contain, and how a file path becomes the slug a URL is built from |
| `blobKey`, `bundleKey`, `revisionKey`, `manifestKey` | The storage key layout, including the content-addressed blob namespace that makes retained history affordable |
| `chunkSchema` | The retrieval chunk the backend indexes and agents search |
| `docsConfigSchema`, `parseDocsConfig` | `docs.yaml`, the per-repository publishing config |
| `splitFrontmatter`, `stripFrontmatter` | Where a page body begins — agreed on by publisher, chunker and renderer, because three answers to that question is three different sets of heading anchors |
| `COLOPHON_ANNOTATION`, `COLOPHON_DOCUMENT_TYPE`, `DEFAULT_CHANNEL` | Strings that independently built consumers have to spell identically |

Ids are deliberately readable rather than opaque: a bundle id is lowercase and
path-like so it can be used verbatim as a storage key prefix, and
`bundles/github.com/org/repo/...` is far easier to debug in a bucket browser
than a hash. Revision ids are the sha-256 of the canonicalised manifest, which
is what makes publishing idempotent.

The only runtime dependency is zod.

## Status

Early development. The bundle contract is not yet stable — this package is
where a breaking change would land, and it may still move without a
`schemaVersion` bump while the shape settles.

## License

[MIT](LICENSE) © Jorge Barnaby
