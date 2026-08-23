---
'@brnby/colophon-common': minor
'@brnby/colophon-cli': minor
'@brnby/plugin-colophon': minor
'@brnby/plugin-colophon-react': minor
'@brnby/plugin-colophon-backend': minor
---

Open up the renderer: pipeline plugins, block-level override slots, and a
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
