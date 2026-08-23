# @brnby/colophon-common

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

## 0.3.0

## 0.2.0

### Minor Changes

- [#25](https://github.com/yorch/colophon/pull/25) [`2c4ec7d`](https://github.com/yorch/colophon/commit/2c4ec7d90198bfaa50005af8beb05ed7951655a1) Thanks [@yorch](https://github.com/yorch)! - Add deletion and garbage collection. Nothing could previously be retired:
  `ColophonDatabase.deleteChannel` and `deleteRevisions` had no callers, so a
  `pr-42`-channel-per-pull-request workflow accumulated channels, revisions,
  pages and chunks forever, and the docs home listed every decommissioned
  repository until someone ran SQL by hand.
  
  - `DELETE /bundles/:bundleId/channels/:channel` and `DELETE /bundles/:bundleId`,
    both behind `colophon.docs.publish`. They act immediately; the permission
    check is the gate. Deleting the bundle's default channel on its own is
    refused with 409 — it would leave a bundle listed everywhere and resolvable
    by nothing.
  - `GET /revisions` reports every retained revision, which is what a collector
    needs and cannot derive from the bundle list.
  - `colophon delete-channel`, `colophon delete-bundle`, and `colophon gc`.
  - `colophon gc` is **dry run by default**: it reports counts and bytes and
    exits. `--confirm` performs the sweep.
  
  Blobs are content-addressed into one flat namespace shared by every bundle, so
  `gc` unions the referenced set across every retained revision of every bundle
  before considering anything unreferenced — a per-bundle computation would
  delete the other repository's live content.
  
  `BundleStorage` in `@brnby/colophon-cli` gains `list` and `delete`, which is
  breaking for anyone who implemented that interface themselves. The backend's
  own storage interface is unchanged and still read-only.

### Patch Changes

- [#24](https://github.com/yorch/colophon/pull/24) [`adfda81`](https://github.com/yorch/colophon/commit/adfda8169e6c201eba06fd2f2a43f0da7a8ae83c) Thanks [@yorch](https://github.com/yorch)! - Build backend links from a new `colophon.appPath` config key instead of a
  hardcoded `/colophon`. The frontend fix for this shipped as a route ref, which
  the backend cannot use: it has no router, and it is the half that writes every
  Backstage Search result location and every URL handed to an agent over MCP. An
  app that moved the page with `page:colophon/colophon` had all of them 404.
  
  Because a second copy of a value drifts silently, the frontend now compares the
  route ref's resolved path against `colophon.appPath` on mount and warns in the
  console when they disagree, naming both paths. The key is declared
  `@visibility frontend` so the browser can read it.

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

## 0.1.0

### Minor Changes

- [#2](https://github.com/yorch/colophon/pull/2) [`5e0bd31`](https://github.com/yorch/colophon/commit/5e0bd3134c455383127af513979bb0f5d82225ba) Thanks [@yorch](https://github.com/yorch)! - First release. Colophon publishes a repository's `docs/` tree as Markdown and
  serves it two ways from one source: rendered in the Backstage portal, and
  exposed as MCP tools for coding agents.
  
  Published under the `next` dist-tag while the bundle contract settles.
  
  Adds the `backstage.pluginPackages` metadata the plugin packages were missing,
  without which `prepack` refuses to run and the packages cannot be published at
  all.
