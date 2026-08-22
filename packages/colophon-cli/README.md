# @brnby/colophon-cli

`colophon publish` and `colophon validate` — what a repository runs in CI to
publish its `docs/` tree as a Colophon bundle, so that Backstage can serve it
to people and to agents.

It scans a directory of Markdown, validates it, assembles a manifest, uploads
content-addressed blobs to object storage, and then asks a Backstage backend to
point a channel at the new revision. The documentation stays Markdown the whole
way — nothing is rendered to HTML at publish time.

**[Documentation](https://yorch.github.io/colophon/)** ·
**[Getting started](https://yorch.github.io/colophon/getting-started.html)** ·
**[Repository](https://github.com/yorch/colophon)**

## Install

There is nothing to install for the common case — CI can run it from npm:

```bash
npx @brnby/colophon-cli publish ./docs --bundle-id github.com/org/repo
```

Add it as a dependency only if you want the library surface below:

```bash
yarn add @brnby/colophon-cli
```

Releases go out under both the `latest` and `next` dist-tags; both currently
point at `0.1.0`.

## validate

```bash
colophon validate ./docs
```

The same scan and validation as `publish`, without uploading anything:
frontmatter, cross-page links, asset references and navigation reachability.
That makes it a reasonable pre-commit hook. `--strict` promotes advisory
diagnostics to errors, so a pipeline can decide whether a draft page or an
unmatched exclude should fail the build.

## publish

```bash
colophon publish ./docs \
  --bundle-id "github.com/org/repo" \
  --channel latest \
  --storage s3 --s3-bucket "$COLOPHON_BUCKET" \
  --source-url "$REPO_URL" --source-ref "$GIT_REF" --source-commit "$GIT_SHA" \
  --backend-url https://backstage.example.com --token "$COLOPHON_TOKEN"
```

| Flag | Why it matters |
| --- | --- |
| `--bundle-id` | Required. Lowercase and path-like, because it is used verbatim as a storage key prefix |
| `--channel` | The mutable pointer this revision claims; defaults to `latest`. Release branches map onto channels, and a PR preview is a throwaway channel that never touches `latest` |
| `--storage local\|s3` | `--local-dir` for the former. `--s3-bucket`, `--s3-region`, `--s3-prefix`, `--s3-endpoint` and `--s3-force-path-style` for the latter, which also covers MinIO and R2 |
| `--source-url`, `--source-ref`, `--source-commit` | Recorded in the manifest; the commit is what makes two builds of the same docs distinguishable, and the URL is what "edit this page" links are built from |
| `--backend-url`, `--token` | Registering the revision. Without them the blobs upload but nothing in Backstage points at them |
| `--dry-run` | Build and validate, upload nothing |

`colophon publish --help` lists the rest.

Publishing is idempotent. The revision id is the sha-256 of the canonicalised
manifest, so a retried pipeline on the same commit resolves to the same
revision rather than accumulating duplicate history.

## As a library

The library surface is exported alongside the CLI so a pipeline that needs
something the flags do not cover can call the pieces directly rather than
shelling out:

```ts
import {
  build,
  hasErrors,
  LocalBundleStorage,
  upload,
} from '@brnby/colophon-cli';

const result = await build({
  docsDir: './docs',
  bundleId: 'github.com/org/repo',
  source: { url: repoUrl, ref: gitRef, commit: gitSha },
});

if (hasErrors(result.diagnostics)) {
  throw new Error('validation failed');
}

await upload({
  manifest: result.manifest,
  pages: result.pages,
  assets: result.assets,
  storage: new LocalBundleStorage('./colophon-storage'),
});
```

`build` is everything up to but excluding the upload, which is why `validate`
and `publish` cannot drift into disagreeing about what is publishable.
`registerRevision` is exported separately, for the step that points a channel
at what you just uploaded.

## Status

Early development. The bundle contract this CLI writes is not yet stable and
may change without a `schemaVersion` bump.

## License

[MIT](LICENSE) © Jorge Barnaby
