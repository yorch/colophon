# @brnby/plugin-colophon-react

## 0.5.0

### Minor Changes

- [#34](https://github.com/yorch/colophon/pull/34) [`4a2ab17`](https://github.com/yorch/colophon/commit/4a2ab173890c58a9cc084af6361769ec913d50b0) Thanks [@yorch](https://github.com/yorch)! - Source links on every page, custom frontmatter carried through to agents, and
  a configurable catalog annotation.
  
  **A rendered page now offers "View source" and "Edit this page".** The
  provenance was already in the manifest — `--source-url`, `--source-ref`,
  `--source-path` have been recorded since the beginning — and
  `ColophonPageHeader` already had an `editUrl` prop. Nothing computed one, so
  a reader had no way back to the Markdown behind the page.
  
  The URL is built through Backstage's `ScmIntegrationRegistry`, the same
  component the catalog uses, rather than by assembling a GitHub path. `byUrl`
  decides whether the host is one this portal integrates with, `resolveUrl`
  joins the page's path onto the docs root, and `resolveEditUrl` produces that
  provider's edit URL — so a self-hosted GitLab gets `/-/edit/` and GitHub
  Enterprise gets `/edit/` without either being named anywhere. GitHub, GitLab,
  Gitea and Bitbucket Cloud are covered.
  
  Both links are **absent, not broken**, whenever any of that is missing: a
  bundle published without `--source-*`, a host with no configured integration,
  or a provider whose URL shape is not known. That is the state every existing
  bundle is in until its next publish, so it had to be the quiet one. "View
  source" is offered alongside "Edit this page" rather than instead of it
  because several providers have no edit mode and return the view URL
  unchanged; the header renders one link, not two identical ones, when they
  match. `ColophonPageHeader` takes `sourceUrl` as a new optional prop.
  
  **Custom frontmatter survives publishing.** Keys Colophon does not define —
  `owner`, `reviewed`, `jira`, whatever an organisation uses — were parsed and
  then dropped. They now travel on the page's new `metadata` field, all the way
  from the publisher to `colophon:get-page`, so an agent asked "who owns this
  page" can answer. Values keep their YAML shape: nested maps stay nested and
  lists stay lists.
  
  This is a **passthrough and nothing more**. Custom keys are not indexed and
  cannot be searched or filtered on; querying them is a separate feature with
  its own design. They ride on `colophon:get-page` only — `colophon:list-pages`
  stays a cheap index, so an agent answering "which pages does platform own?"
  reads the pages it cares about rather than getting the whole corpus's
  metadata in one response.
  
  *What an adopter sees:* it depends on whether their pages already carry keys
  outside `title`, `description`, `type`, `status`, `tags`, `nav_order`.
  
  - **No custom keys anywhere:** nothing changes at all. `metadata` is omitted
    rather than defaulted to `{}`, and `canonicalize` drops `undefined`, so
    re-publishing unchanged documentation produces the **same revision id** as
    before — verified by publishing one fixture with both the old and the new
    publisher and getting the same hash.
  - **Already using `owner:` / `reviewed:` / anything else:** the next publish
    produces a **new revision id for byte-identical documentation**, because
    content that used to be discarded is now recorded. That is correct — the
    manifest genuinely describes more than it did — but it means one extra
    revision lands in the retention window on upgrade, and a pipeline asserting
    that an unchanged commit republishes to the same revision will see it move
    once.
  
  *What an older deployment sees:* the field is additive in both directions, so
  the two halves can be upgraded independently. A backend running the previous
  schema parses a newer bundle with an object schema that does not declare
  `metadata`, and zod strips undeclared keys — it reads the revision correctly
  and simply never sees the field. A backend running this version reads an
  older bundle and finds the key absent, which is exactly the "no custom keys"
  case. `schemaVersion` therefore stays at `1`, because neither direction
  errors. The backend gains a migration adding a nullable `metadata` column to
  `colophon_pages`; rows written before it read back as "no custom keys", which
  is the truth for them.
  
  **`colophon.annotation` makes the catalog annotation configurable**, defaulting
  to `brnby.io/colophon`. An organisation that namespaces its annotations no
  longer has to rename them across its whole catalog to adopt the plugin. The
  backend reads it when indexing entity links, and the frontend reads it — hence
  `@visibility frontend` — because the documentation tab has to look up the same
  key that was indexed.
  
  One thing has to move with it: the predicate deciding whether the tab appears
  at all is an `EntityContentBlueprint` filter, which the frontend system
  evaluates without access to config. Rename the annotation and override the
  filter together, or the tab keeps testing for the old key and an annotated
  entity silently gets no tab. Both are documented in
  `docs/reference/configuration.md`.

- [#37](https://github.com/yorch/colophon/pull/37) [`54b349c`](https://github.com/yorch/colophon/commit/54b349c6d836400165c521020b08f87ae1709dbb) Thanks [@yorch](https://github.com/yorch)! - **Bundle storage is now an extension point.** An organisation whose object
  storage is neither a filesystem nor S3-compatible — Azure Blob being the
  obvious case — had exactly one option: fork the backend. `createBundleStorage`
  was a hardcoded `if (local) … if (s3) … else throw`, `BundleStorage` was not
  exported, and the plugin built its own store with nothing to inject into.
  
  `colophonStorageExtensionPoint` is the first extension point this plugin
  exposes. A backend module registers a **named factory**, and
  `colophon.storage.type` selects it by name:
  
  ```ts
  import { colophonStorageExtensionPoint } from '@brnby/plugin-colophon-backend';
  
  export const colophonModuleAzureStorage = createBackendModule({
    pluginId: 'colophon',
    moduleId: 'azure-storage',
    register(env) {
      env.registerInit({
        deps: { colophonStorage: colophonStorageExtensionPoint },
        async init({ colophonStorage }) {
          colophonStorage.addFactory({
            name: 'azure',
            factory: ({ config }) =>
              new AzureBundleStorage(config?.getString('container')),
          });
        },
      });
    },
  });
  ```
  
  ```yaml
  colophon:
    storage:
      type: azure
      azure: { container: docs }
  ```
  
  A *name* rather than a store, because where bundles live is a deployment
  decision and deployment decisions belong in `app-config.yaml`. An extension
  point taking a store directly would mean staging and production differed by a
  code branch rather than a config key, and the same backend image could no
  longer be promoted between them.
  
  **`local` and `s3` register through the same `addFactory` call**, before any
  module runs. There is one lookup path rather than a built-in shortcut and an
  adopter path that nothing exercises — the shape this project has been bitten
  by before. It also means the duplicate-name check covers them: a module
  cannot silently replace `local`.
  
  Newly exported from the package's single entry point (there is no `/alpha`
  subpath): `colophonStorageExtensionPoint`, `ColophonStorageExtensionPoint`,
  `BundleStorage`, `BundleStorageFactory`, `BundleStorageFactoryOptions`,
  `BundleStorageRegistration`.
  
  `addFactory` and the factory both take an options object rather than
  positional arguments. This is the extension point's own signature and the
  hardest thing in the package to change later, and `description`, an explicit
  `override` and a deprecation marker are each free to add now and breaking once
  anyone has called it. **Any method added to `BundleStorage` in future will be
  optional** — a new required method would break every adopter store at once,
  which is precisely what adding `list` and `delete` did to the CLI's copy.
  
  *What an adopter gains:* a three-method interface — `has`, `get`, `put` — and
  a factory that is handed its own slice of config plus a logger. Not the root
  config: a module already has `coreServices.rootConfig` in its own `deps`.
  Registration happens during module init and the store is built during plugin
  init, which Backstage guarantees runs after every module of that plugin, so
  there is no ordering to arrange and no lifecycle hook to hang it on.
  
  *Failures are startup failures, never a 404 on the first read.* A `type`
  nothing registered stops the backend and **names what is registered**, because
  the set is open and the reader cannot look it up:
  `Unknown colophon.storage.type "azur"; registered types are "local", "s3".
  Register another with colophonStorageExtensionPoint from a backend module.`
  A second factory for a taken name throws
  `A colophon.storage factory named "local" is already registered`, naming the
  module that lost. A factory that throws is wrapped with the store's name. A
  factory that returns something that is not a store is refused at startup too —
  types catch the naive case and not a cast through `any`, a JavaScript adopter
  or a duck-typed SDK object, and without the check that store starts the backend
  and fails on the first page opened. Registering after the store has been built
  is refused rather than accepted and ignored.
  
  *The backend now says where it reads from.* One line naming the resolved type,
  and for the built-ins the resolved absolute directory or `s3://bucket/prefix`.
  Nothing said so before, and `storage.local.root` silently resolving to the
  wrong directory is a bug this project has already shipped. Each factory is
  handed a logger tagged with its store's name.
  
  *The config schema.* `colophon.storage.type` was `'local' | 's3'` and is now
  `string`. It cannot stay an enum: an enum would reject every adopter's own
  name outright. The check moved to startup, where the backend knows what it
  installed. Sub-config still validates — a module declares its own
  `colophon.storage.<name>` keys in its own `config.d.ts`, Backstage merges
  package schemas additively, and `config:check --strict` continues to catch a
  misspelling of the built-in keys *and* the adopter's.
  
  *Existing deployments need no change.* `colophon.storage` is read exactly as
  before, `type` still defaults to `local`, and both built-in stores are
  selected by the same names with the same keys. No `app-config.yaml` edit, no
  code change, nothing to migrate.
  
  *Not merged with the CLI's `BundleStorage`*, which has five methods. The
  publisher writes and collects garbage, so it needs `list` and `delete`; the
  backend is expected to hold read-only credentials and calls neither. Merging
  them would force every custom reader to implement a `delete` nothing calls.
  `createColophonService` takes an optional `storage`; omitted, it behaves as
  it always has.

### Patch Changes

- Updated dependencies [[`4a2ab17`](https://github.com/yorch/colophon/commit/4a2ab173890c58a9cc084af6361769ec913d50b0), [`54b349c`](https://github.com/yorch/colophon/commit/54b349c6d836400165c521020b08f87ae1709dbb)]:
  - @brnby/colophon-common@0.5.0

## 0.4.0

### Minor Changes

- [#32](https://github.com/yorch/colophon/pull/32) [`1166182`](https://github.com/yorch/colophon/commit/1166182d9bfbbc0d29084e0c13b96c4c40b22eb3) Thanks [@yorch](https://github.com/yorch)! - Open up the renderer: pipeline plugins, block-level override slots, and a
  cascade layer so adopter CSS wins.
  
  **The Markdown pipeline is extensible: `remarkPlugins`, `rehypePlugins` and
  `sanitizeSchema`.** Admonitions, maths and custom directives are reachable for
  the first time. Built-ins keep their place, so `remark-gfm` keeps working and
  sanitisation still runs before slugging — the ordering that keeps heading ids
  matching the manifest's anchors.
  
  They are reachable two ways. As props on `ColophonMarkdown` if you have built
  your own shell, and — because `DocsBrowser` owns that call site in the shipped
  frontend plugin — through the new **`ColophonPipelineProvider`**, installed
  exactly like `ColophonComponentsProvider` and nesting the same way. Without
  the provider the feature would have existed only for people who had already
  replaced the page.
  
  The three ship together on purpose. A remark plugin emits upstream of the
  sanitiser, so anything it produces that the schema does not allow is stripped
  and the page renders as though the plugin never ran. `sanitizeSchema` is how
  you widen the allow-list, and the only supported route to it; extend
  `colophonSanitizeSchema` rather than replacing it. Rehype plugins run after
  the sanitiser and their output is not checked.
  
  **Naming `rehype-sanitize` or `rehype-slug` in `rehypePlugins` is rejected.**
  `unified` matches plugins by function identity, so such an entry does not add
  a pass — it rewrites the built-in one in place, merging your options into it.
  `[rehypeSlug, { prefix: 'user-content-' }]` therefore reconfigured Colophon's
  own slug pass and made every table-of-contents link on the page dead, silently;
  `[rehypeSanitize, …]` was a second, undocumented route into the security
  boundary. An entry with options now throws, naming the consequence. A bare
  entry is genuinely inert, so it only warns — a bare `rehypeSlug` is half of the
  standard `rehype-autolink-headings` recipe and that keeps working.
  
  **Seven new component override slots**, all block-level: `paragraph`,
  `blockquote` (what admonitions are usually authored as), `list`, `listItem`,
  `tableHead`, `tableRow` and `tableCell`. The registry now follows a stated
  rule — block-level constructs get a slot, inline formatting does not — so
  `em` and `strong` stay CSS-only, as do `hr`, `tbody` and the `section`
  `remark-gfm` generates for footnotes, none of which has children to
  restructure. `listItem` receives `id` and the `task-list-item` class, and
  `tableCell` receives GFM column alignment, because an override that dropped
  any of them failed silently.
  
  **An unknown override key now warns in development builds**, naming the key
  and listing the slots that exist, once per name. It used to be inert:
  TypeScript rejected it, the runtime did not, and adopters cast past the type.
  Unknown keys are also dropped from the merged registry rather than carried
  along.
  
  **Behaviour change: the stylesheet is emitted inside `@layer colophon`.** It
  is injected last, so on a specificity tie it used to win against the app's own
  CSS purely by arriving later — backwards for a library. Layered rules lose to
  unlayered ones regardless of specificity or order, so app CSS now wins by
  default. The flip side is that an aggressive *unlayered* reset in the app also
  beats this stylesheet now, where before it lost; an app that wants the old
  precedence can order the layer itself with `@layer app, colophon;`. The layer
  name is exported as `COLOPHON_STYLE_LAYER`. Container queries and the
  reduced-motion rule are unaffected, and cascade layers are supported
  everywhere the container queries already required.

### Patch Changes

- [#30](https://github.com/yorch/colophon/pull/30) [`c9bd1fa`](https://github.com/yorch/colophon/commit/c9bd1fa7a2d663aa57b8511aa90597880ef47388) Thanks [@yorch](https://github.com/yorch)! - Documentation only: the install instructions no longer ask for the `next`
  dist-tag. Releases go out under `latest` now, and `next` has been removed from
  the registry, so `@brnby/…@next` does not resolve at all — every package README
  told a reader to install a tag that is gone. npm ships README.md in the tarball
  whatever `files` says, so this reaches the registry page as well as the
  repository.
  
  The replacements name no version number. A sentence that hardcodes one is what
  went stale here in the first place; "under `latest`" stays true across releases.
- Updated dependencies [[`1166182`](https://github.com/yorch/colophon/commit/1166182d9bfbbc0d29084e0c13b96c4c40b22eb3), [`c9bd1fa`](https://github.com/yorch/colophon/commit/c9bd1fa7a2d663aa57b8511aa90597880ef47388)]:
  - @brnby/colophon-common@0.4.0

## 0.3.0

### Minor Changes

- [#26](https://github.com/yorch/colophon/pull/26) [`bf13941`](https://github.com/yorch/colophon/commit/bf1394154c22f424f708f095c9ec7322f8d8a034) Thanks [@yorch](https://github.com/yorch)! - Adopter `link` and `image` overrides now win.
  
  `DocsBrowser` installed its reference-resolving `link` and `image` components
  as the innermost provider, so an app's overrides for those two slots were
  always shadowed — five of the seven slots were overridable and two silently
  were not. Colophon now fills those slots only when the app has not claimed
  them, and exports `useColophonReference` so an override that does claim one can
  still resolve relative links, anchors and assets the way the built-in
  components do.
  
  Also fixes two design tokens that do not exist in `@backstage/ui`:
  `--bui-fg-link` and `--bui-bg-surface-1`. The first left the bundle row with no
  visible focus indicator, which is an accessibility defect — `var()` with no
  fallback resolves to nothing and drops the declaration silently. A test now
  checks every `--bui-*` name in the stylesheet against the stylesheet
  `@backstage/ui` ships.
  
  `ensureColophonStyles` and `COLOPHON_STYLE_ELEMENT_ID` are now exported, making
  the documented stylesheet opt-out a supported API.

### Patch Changes

- Updated dependencies []:
  - @brnby/colophon-common@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`adfda81`](https://github.com/yorch/colophon/commit/adfda8169e6c201eba06fd2f2a43f0da7a8ae83c), [`2c4ec7d`](https://github.com/yorch/colophon/commit/2c4ec7d90198bfaa50005af8beb05ed7951655a1)]:
  - @brnby/colophon-common@0.2.0

## 0.1.1

### Patch Changes

- [#7](https://github.com/yorch/colophon/pull/7) [`e1617cf`](https://github.com/yorch/colophon/commit/e1617cf1293fa666088fab4ed4549852ebb126f2) Thanks [@yorch](https://github.com/yorch)! - Give each published package its own README, LICENSE and npm metadata.
  
  Only the repository root had a README, and npm renders the README it finds in
  the tarball — so all five package pages were blank, with no repository link, no
  link to the documentation site, and nothing to find them by in search.
  
  Each package now carries a README written for someone landing on its npm page
  rather than on the repository, plus `repository` (with the `directory` field
  that makes npm link into the right subdirectory), `homepage`, `bugs` and
  keywords.
- Updated dependencies [[`e1617cf`](https://github.com/yorch/colophon/commit/e1617cf1293fa666088fab4ed4549852ebb126f2)]:
  - @brnby/colophon-common@0.1.1

## 0.1.0

### Minor Changes

- [#2](https://github.com/yorch/colophon/pull/2) [`5e0bd31`](https://github.com/yorch/colophon/commit/5e0bd3134c455383127af513979bb0f5d82225ba) Thanks [@yorch](https://github.com/yorch)! - First release. Colophon publishes a repository's `docs/` tree as Markdown and
  serves it two ways from one source: rendered in the Backstage portal, and
  exposed as MCP tools for coding agents.
  
  Published under the `next` dist-tag while the bundle contract settles.
  
  Adds the `backstage.pluginPackages` metadata the plugin packages were missing,
  without which `prepack` refuses to run and the packages cannot be published at
  all.

### Patch Changes

- Updated dependencies [[`5e0bd31`](https://github.com/yorch/colophon/commit/5e0bd3134c455383127af513979bb0f5d82225ba)]:
  - @brnby/colophon-common@0.1.0
