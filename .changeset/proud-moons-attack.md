---
'@brnby/colophon-common': minor
'@brnby/colophon-cli': minor
'@brnby/plugin-colophon': minor
'@brnby/plugin-colophon-react': minor
'@brnby/plugin-colophon-backend': minor
---

Open up the renderer: pipeline plugins, block-level override slots, and a
cascade layer so adopter CSS wins.

**`ColophonMarkdown` now takes `remarkPlugins`, `rehypePlugins` and
`sanitizeSchema`.** Admonitions, maths, footnotes and custom directives are
reachable for the first time. Plugins are appended to the built-ins rather
than replacing them, so `remark-gfm` keeps working and sanitisation still runs
before slugging — the ordering that keeps heading ids matching the manifest's
anchors.

The three ship together on purpose. A remark plugin emits upstream of the
sanitiser, so anything it produces that the schema does not allow is stripped
and the page renders as though the plugin never ran. `sanitizeSchema` is how
you widen the allow-list; extend `colophonSanitizeSchema` rather than
replacing it, and do not reach for `rehype-raw`. Rehype plugins are appended
after the sanitiser and their output is not checked.

**Seven new component override slots**, all block-level: `paragraph`,
`blockquote` (what admonitions are usually authored as), `list`, `listItem`,
`tableHead`, `tableRow` and `tableCell`. The registry now follows a stated
rule — block-level constructs get a slot, inline formatting does not — so
`em` and `strong` stay CSS-only, as do `hr` and `tbody`. `listItem` receives
the `task-list-item` class and `tableCell` receives GFM column alignment,
because an override that dropped either failed silently.

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
