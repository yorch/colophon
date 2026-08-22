# AGENTS.md

Instructions for AI coding agents working in this repository. Human-facing
docs live in [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md);
this file is the operational summary plus the things that have already gone
wrong here.

## Project overview

Colophon keeps repository documentation as **Markdown** and renders it at the
edges, rather than committing to HTML at build time the way TechDocs does. CI
publishes a `docs/` tree to object storage as content-addressed blobs plus an
immutable manifest; Backstage indexes that into Postgres and serves it two
ways from one source of truth — rendered in the portal for humans, and exposed
through the MCP Actions Backend as clean Markdown for agents. A **revision** is
an immutable snapshot; a **channel** (`latest`, `1.x`, `pr-42`) is a mutable
pointer at one, which is what makes rollback a pointer move rather than a
rebuild.

Yarn 4 monorepo (node-modules linker), Node 22 or 24, TypeScript.

| Workspace | Package | Purpose |
| --- | --- | --- |
| `packages/colophon-common` | `@brnby/colophon-common` | The bundle contract — manifest schema, ids, storage keys, chunk types. Every other package negotiates through it, so compatibility is decided here |
| `packages/colophon-cli` | `@brnby/colophon-cli` | `colophon publish` / `colophon validate` — what CI runs |
| `plugins/colophon-backend` | `@brnby/plugin-colophon-backend` | Storage, database, chunking, HTTP routes, search collator, MCP actions |
| `plugins/colophon-react` | `@brnby/plugin-colophon-react` | The Markdown renderer and its component override registry |
| `plugins/colophon` | `@brnby/plugin-colophon` | Frontend plugin — entity docs tab and cross-repository docs home |
| `dev-app/` | private | A real Backstage app — frontend, backend, catalog, search — with Colophon installed. Never published |

`dev-app/` exists because unit tests could not answer whether the plugin
behaves in a deployment. It is the place to check anything involving routing,
layout or scrolling.

## Commands

`yarn verify` is **the gate**. It is lint, architecture lint, site-chrome
lint, typecheck and test, and it is exactly what CI runs.

```bash
corepack enable
yarn install
yarn verify
```

| Command | What it does |
| --- | --- |
| `yarn verify` | `lint` + `lint:arch` + `lint:site` + `tsc` + `test` — run before every commit |
| `yarn lint` | Biome — formatting and general lint |
| `yarn lint:fix` | Biome, applying fixes |
| `yarn lint:arch` | ESLint, Backstage dependency-hygiene rules only |
| `yarn lint:site` | `scripts/check-site-chrome.mjs` — the five `site/` pages still share one header, footer and theme wiring |
| `yarn tsc` | Typecheck |
| `yarn test` | Jest, single run |
| `yarn build` | Build all packages (excludes the dev app) |
| `yarn start` | Local Backstage app on :3000, backend on :7007 |
| `yarn dev:seed` | Publish this repository's own `docs/` into the running app |
| `node scripts/check-packables.mjs` | Refuse-to-publish guard; also restores half-packed manifests |

`yarn start` and `yarn dev:seed` are two terminals: the seed publishes through
the real CLI in two steps — blobs to storage, then an HTTP call registering the
revision — so the backend has to be up first. Then open
<http://localhost:3000/colophon>.

Everything local is SQLite in memory, bundles under `colophon-data/`, guest
sign-in. Guest is a real identity rather than disabled auth, so the authorizer
still runs its catalog visibility check.

## Releases and changesets

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the full process. The parts an
agent has to get right:

- **Every pull request touching a published package needs a changeset.** Run
  `yarn changeset`, answer the prompts, and commit the generated file under
  `.changeset/`. CI runs `yarn changeset status --since=origin/<base>` and
  fails the pull request without one. `dev-app/*` is private and needs none.
- For a change with no user-visible effect — a test, a CI tweak, this file —
  record that deliberately with `yarn changeset add --empty` rather than
  skipping the check.
- The five published packages are a **fixed group**: one version, always
  released together. They are one system with one contract, so a package with
  no changes still gets a bump. That is the cheaper of the two mistakes.
- Merging to `main` makes the Release workflow open a bot **"chore: version
  packages"** pull request. **Merging that pull request is what publishes.**

### Never publish, never add a credential

Publishing authenticates over **npm trusted publishing (OIDC)**, minted by
`id-token: write` in `.github/workflows/release.yml` and exchanged by Yarn
itself. There is deliberately **no npm token anywhere** — not in the
workflow, not in repository secrets, not in a `.npmrc`. The alternative is a
bypass-2FA bearer credential worth exactly as much to an attacker as to CI.

So: do not add one, do not suggest adding one, and do not run `yarn release`,
`changeset publish`, `npm publish` or `npm dist-tag` yourself. Publishing is
the one action here that cannot be undone — an npm version cannot be
unpublished after 72 hours.

## Conventions

**Conventional Commits** for commit messages and pull request titles: `fix:`,
`feat:`, `docs:`, `chore:`, `refactor:`, `test:`, with an optional scope —
`fix(site): …`.

**Biome owns all formatting and general linting** (`biome.json`). Single
quotes, trailing commas, 2-space indent, 80 columns, organised imports. Run
`yarn biome check --write .` rather than hand-formatting.

**ESLint exists for exactly one job**: `plugin:@backstage/recommended`, seven
monorepo dependency-hygiene rules with no stylistic content, which is why the
two tools cannot conflict. It catches imports that only resolve because Yarn
hoisted them to the root — they install cleanly here and then fail for anyone
consuming the published package. **Do not add stylistic rules to
`.eslintrc.js`.**

**Comments explain _why_, not _what_.** The house style here is unusually
explanatory about the reasoning behind a decision, and terse about mechanics:
a module-level comment says what problem the file solves and what was tried
instead, and a comment above a surprising line says why it is that way. A
comment restating the code below it is noise. Read `scripts/check-packables.mjs`,
`plugins/colophon-react/src/useAnchorScroll.ts` or `.eslintrc.js` for the
register to match.

**Temporary files go in `tmp/` at the repository root**, never `/tmp`. It is
already gitignored.

## Traps this project has already paid for

Each of these cost real time. They are not hypothetical.

**`@brnby/plugin-colophon-backend` has no `/alpha` subpath.** The package
declares no `exports` map, so a subpath import does not resolve at all. Import
`searchModuleColophonCollator` from the main entry point:

```ts
import { searchModuleColophonCollator } from '@brnby/plugin-colophon-backend';

backend.add(import('@brnby/plugin-colophon-backend'));
backend.add(searchModuleColophonCollator);
```

**The frontend plugin is a _default_ export.** `import colophonPlugin from
'@brnby/plugin-colophon'` — not a named one.

**Any component in `plugins/colophon-react` that emits a `colophon-` CSS class
must call `useColophonStyles()`.** The stylesheet is injected on demand, and it
now carries layout, list rows and navigation state — things that appear on
pages where no Markdown is rendered, and which came out unstyled when only the
Markdown renderer injected it. `plugins/colophon-react/src/styles.test.tsx`
renders each such component **alone**, which is the only arrangement that
catches one relying on a sibling to do it. Add a case there when you add a
component. (`ensureColophonStyles()` is the non-hook form for call sites that
are not components.)

**The renderer uses container queries, not media queries.** See
`plugins/colophon-react/src/styles.ts`: `.colophon-layout-container` sets
`container-type: inline-size` and the breakpoints are `@container`. The same
components render full-page and inside a much narrower entity tab, so viewport
width is the wrong question to ask. The only `@media` rule is
`prefers-reduced-motion`, which genuinely is a viewport-level concern.

**`backstage-cli package prepack` rewrites `package.json` to point `main` and
`types` at `dist/`, and `postpack` restores it** — but only if the pack reaches
the end. A crashed pack strands the rewritten manifest and a
`package.json-prepack` backup in the working tree. Committing that points the
repository's own entrypoints at gitignored build output and breaks `yarn start`
and the tests for everyone. `scripts/check-packables.mjs` now restores them,
and refuses to publish a package with nothing under `dist/` or still at the
placeholder `0.0.0`. If you see a modified `package.json` you did not touch,
that is what it is — do not commit it.

**jsdom has no layout, no router and no scrolling.** Tests can assert that an
anchor is correct while a real browser does nothing with it. The existing
tests say so out loud — `useAnchorScroll.test.tsx` asserts the *calls*, and
`useContainerWidth.test.tsx` asserts the *wiring*, because there is no layout
engine and no `ResizeObserver`. Anything about layout, scroll position or
deep-link landing must be verified in a real browser via `yarn start`. A green
test suite is not evidence that scrolling works.

**Never commit without `yarn verify` passing.** Chain them so a failing gate
cannot produce a commit:

```bash
yarn verify && git commit -m 'fix: …'
```

## What not to do

- Do not publish to npm, or add any npm token, `.npmrc` credential or
  repository secret. See above.
- Do not rewrite history that has been pushed — no `push --force` on a shared
  branch, no rebasing `main`.
- Do not broaden scope beyond what was asked. Do not "improve" adjacent code,
  reformat untouched files, or delete pre-existing dead code — mention it
  instead.
- Do not open pull requests, merge, or hit the release workflow unless asked.
