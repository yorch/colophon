---
title: Customising rendering
description: Replacing rendered components, extending the Markdown pipeline, theming through Backstage UI tokens, and what Colophon does not let you change.
type: how-to
tags: [customisation, frontend]
---

# Customising rendering

Colophon renders Markdown at read time rather than baking HTML at build time,
which is what makes this possible at all: the renderer is a React component
tree, so an adopter replaces a component instead of fighting CSS specificity
against HTML someone else already emitted.

Three knobs, in the order you should reach for them:

1. **Design tokens** — brand colours, spacing and fonts follow the Backstage UI
   theme already, so most portals need nothing here.
2. **Component overrides** — replace how one kind of Markdown node renders.
3. **The Markdown pipeline** — add remark or rehype plugins, and widen the
   sanitisation schema so their output survives.

## The override slots

All optional. Anything left out keeps the shipped default.

| Slot | Renders | Props |
| --- | --- | --- |
| `code` | inline code spans | `{ value }` |
| `codeBlock` | fenced blocks with no registered language | `{ language, value }` |
| `link` | Markdown links | `{ href, title, children }` |
| `image` | Markdown images | `{ src, alt, title }` |
| `heading` | `#`…`######` | `{ depth, id, children }` |
| `paragraph` | paragraphs | `{ children }` |
| `blockquote` | `>` blocks — where admonitions go | `{ children }` |
| `list` | `ul` and `ol` alike | `{ ordered, start, children }` |
| `listItem` | list items | `{ className, children }` |
| `table` | the table wrapper | `{ children }` |
| `tableHead` | `thead` | `{ children }` |
| `tableRow` | `tr` | `{ children }` |
| `tableCell` | `th` and `td` alike | `{ header, align, children }` |
| `codeLanguages` | fenced blocks keyed by language | `Record<string, ComponentType<CodeBlockProps>>` |

`codeLanguages` is why Mermaid is not special-cased anywhere in the renderer:
it is the handler registered under `mermaid`, and PlantUML or Vega plug in the
same way. It merges key by key, so registering `plantuml` does not
unregister `mermaid`.

Providers **nest rather than replace**. An inner provider that overrides `link`
keeps an outer provider's `code`, which is what lets a portal set defaults once
while a single page still swaps one component.

### Where the line is drawn

So that the next request does not have to be argued from scratch:

> **Block-level constructs get a slot. Inline formatting does not.**

A block is a thing an override may need to *restructure* — read its children
and emit something else entirely, which is how a blockquote becomes an
admonition and a table becomes a data grid. CSS cannot do that, so a component
boundary is the only way to reach it.

Inline formatting — `em`, `strong`, `del`, `sup` — is a run of text inside a
block. `.colophon-markdown em` already reaches every one of them, an override
could only re-wrap the same text, and a component boundary on every emphasised
word costs render work on every page for nothing gained. Two block-level
exceptions prove the same rule: `hr` has no children to restructure and
`tbody` is a grouping wrapper with no content of its own, so both stay plain
HTML.

### Two props worth passing through

`listItem` receives `className` and `tableCell` receives `align` because
dropping them is silent:

- `className` is `task-list-item` on a GFM checkbox item, and the rule that
  hides the bullet keys off it. An override that ignores it renders a checkbox
  with a bullet beside it.
- `align` carries the `:--`/`--:` markers from the delimiter row. The default
  renders it as an inline `text-align`, which is what it takes to beat the
  stylesheet's own `text-align: start` — a class would lose.

### Misspelled slots

An unknown key is rejected by TypeScript and, in a development build, warned
about at runtime:

```text
[colophon] Unknown component override "blockqoute" — ignored. Known slots: …
```

The warning exists because casting past the type — `as ColophonComponents`, a
helper that widens it, config-driven wiring — used to leave the override
sitting in an object nothing reads, with the page rendering exactly as before
and no clue where to look. It fires once per unknown name, not once per render.

## Installing overrides

`ColophonComponentsProvider` is a React context provider, so it goes in
wherever your app can wrap the tree. In the new frontend system that is
`AppRootWrapperBlueprint`, attached to the `app` plugin:

```tsx
// packages/app/src/colophonBranding.tsx
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import { useColophonReference } from '@brnby/plugin-colophon';
import type { LinkProps } from '@brnby/plugin-colophon-react';
import { ColophonComponentsProvider } from '@brnby/plugin-colophon-react';

function BrandLink({ href, title, children }: LinkProps) {
  // Resolve first — see "Relative references" below.
  const { kind, href: resolved } = useColophonReference(href);
  return (
    <a
      className="brand-link"
      href={resolved}
      title={title}
      {...(kind === 'external'
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : undefined)}
    >
      {children}
    </a>
  );
}

const colophonComponents = AppRootWrapperBlueprint.make({
  name: 'colophon-components',
  params: {
    component: ({ children }) => (
      <ColophonComponentsProvider components={{ link: BrandLink }}>
        {children}
      </ColophonComponentsProvider>
    ),
  },
});

export const colophonBrandingModule = createFrontendModule({
  pluginId: 'app',
  extensions: [colophonComponents],
});
```

Then add the module to the app's features, beside the plugin itself. Note that
**the plugin is a default export** and the module is a named one:

```tsx
// packages/app/src/App.tsx
import colophonPlugin from '@brnby/plugin-colophon';
import { colophonBrandingModule } from './colophonBranding';

const app = createApp({
  features: [colophonPlugin, colophonBrandingModule /* … */],
});
```

## Relative references

A link authored as `[Rollback](./rollback.md)` is written against the file
layout, and served from a URL space that looks nothing like it. The renderer
hands hrefs through **exactly as authored**, because resolving them needs
routing context — which bundle, which page, which channel — that it does not
have.

Colophon supplies `link` and `image` components that do the resolving, but only
for slots your app has not claimed. Override `link` and that resolution becomes
yours to do, which is what `useColophonReference` is for:

```ts
const { kind, href } = useColophonReference(hrefAsAuthored);
```

| `kind` | Meaning | `href` |
| --- | --- | --- |
| `external` | leaves the portal | the reference, unchanged — add `rel="noopener noreferrer"` |
| `anchor` | a heading on this page | `#slug`; keep it a plain `<a>` so the browser scrolls natively |
| `page` | another page in this bundle | the portal href, anchor included |
| `asset` | an image or file in the bundle | the asset URL, or `undefined` while it is being looked up |

An override that skips this step still compiles, still renders, and turns every
relative link and image in every published page into a 404. The publisher
checked those links and refused to publish when one was broken, so nothing
downstream will warn you.

The hook resolves against the page currently being rendered, so it works
anywhere inside Colophon's own page view. Outside it, references pass through
untouched.

## The Markdown pipeline

`ColophonMarkdown` takes three props that reach the unified pipeline itself:

| Prop | Appended to | Runs |
| --- | --- | --- |
| `remarkPlugins` | `remark-gfm` | on the Markdown tree, **before** sanitisation |
| `rehypePlugins` | `rehype-sanitize` → `rehype-slug` | on the HTML tree, **after** sanitisation |
| `sanitizeSchema` | replaces `colophonSanitizeSchema` | the sanitiser's allow-list |

Built-ins are appended to, never replaced: `remark-gfm` keeps working, and the
sanitise-then-slug pair keeps its order — that ordering is what makes heading
ids come out unprefixed and match the anchors the manifest recorded.

Memoise the arrays. A new array identity on every render makes react-markdown
reprocess the whole document.

### A remark plugin needs a schema to match

This is the one thing to get right. A remark plugin emits into the Markdown
tree, which is **upstream** of the sanitiser — so anything it produces that
the schema does not allow is stripped on the way out, and the page renders as
though the plugin were never passed. The text survives; only the structure
disappears. It reads exactly like "my plugin did not run".

So the two ship together. An admonition plugin that emits
`<aside class="admonition">`:

```tsx
import type { SanitizeSchema } from '@brnby/plugin-colophon-react';
import {
  ColophonMarkdown,
  colophonSanitizeSchema,
} from '@brnby/plugin-colophon-react';

// Annotated, not inferred: an attribute rule is a tuple, and an unannotated
// object literal widens it to string[][], which the schema type rejects.
const schema: SanitizeSchema = {
  ...colophonSanitizeSchema,
  tagNames: [...(colophonSanitizeSchema.tagNames ?? []), 'aside'],
  attributes: {
    ...colophonSanitizeSchema.attributes,
    aside: [['className', 'admonition']],
  },
};

const remarkPlugins = [remarkAdmonition];

<ColophonMarkdown
  content={content}
  remarkPlugins={remarkPlugins}
  sanitizeSchema={schema}
/>;
```

**Extend the schema; do not replace it.** Page bodies come from arbitrary
repositories — anyone who can open a pull request against any indexed
repository chooses what this renders — so the schema is a security boundary,
not a formatting preference. `colophonSanitizeSchema` is GitHub's allow-list
plus the three additions the renderer needs.

**Do not reach for `rehype-raw`.** It reinstates the raw HTML that the
pipeline otherwise drops, which is the whole attack surface the sanitiser
exists to remove. If a feature needs another tag or attribute, allow that tag
or attribute.

### Rehype plugins run after the sanitiser

That is deliberate — a syntax highlighter's spans and classes would be
stripped otherwise — and it means their output is **not** checked. Safe
because those plugins are your own code; the untrusted input is the page
content, and a rehype plugin that lifts raw strings out of the tree and
reinserts them as HTML hands that content back the one thing sanitisation took
away.

One limit worth knowing: a rehype plugin that decorates an element which has
an override slot loses the decoration. Slot props are a fixed contract, so a
class added to an `h2` never reaches the `heading` component and never reaches
the DOM. Elements with no slot — inline formatting — pass through untouched.

## Brand colours

Every colour, space, font and radius in Colophon's stylesheet is a
[Backstage UI](https://backstage.io/docs/getting-started/app-custom-theme)
token, so it follows the app's theme in light and dark without a second rule
set. Retheming the portal rethemes the documentation; there is nothing
Colophon-specific to set.

These are the tokens it reads:

| Token | Where it lands |
| --- | --- |
| `--bui-fg-primary` | prose text, table-of-contents hover |
| `--bui-fg-secondary` | blockquotes, table-of-contents links |
| `--bui-bg-neutral-1` | bundle rows on the docs home, navigation hover |
| `--bui-bg-neutral-2` | code, table headers, skeletons, the active nav row |
| `--bui-accent-bg` | the active navigation item's indicator bar |
| `--bui-ring` | the focus ring on a bundle row |
| `--bui-border-1`, `--bui-border-2` | rules, table cells, card borders |
| `--bui-font-regular`, `--bui-font-monospace` | prose and code |
| `--bui-font-size-3`, `--bui-font-size-4`, `--bui-font-weight-bold` | type scale |
| `--bui-radius-1`…`-3`, `--bui-space-1`…`-8` | corners and rhythm |

A test asserts that every `--bui-*` name in the stylesheet is one
`@backstage/ui` actually defines, and `@backstage/eslint-plugin`'s
`no-deprecated-bui-tokens` catches the ones on their way out. Both guards exist
because the failure mode is silent: `var()` with no fallback resolves to nothing
and the declaration is dropped, so an invented token name costs you a focus ring
and nothing complains.

## The stylesheet

Colophon injects one `<style>` element into `document.head`, once, the first
time any component that needs it renders. Two consequences worth knowing:

**Every rule is inside `@layer colophon`, so your CSS wins by default.** The
element is appended whenever the first Colophon component mounts, which for a
lazily-loaded route is after your app's own stylesheets — and on a specificity
tie, the later sheet used to win. That is backwards for a library. Layered
rules lose to every *unlayered* rule regardless of specificity or order, so
`.colophon-markdown p` in your app now beats Colophon's, and so does a bare
`p`, with nothing to configure.

Read the other way, that is the cost: an aggressive unlayered reset in your app
now beats this stylesheet too, where before it lost. If that is not what you
want, put your reset in a layer and order it:

```css
@layer app, colophon;
```

The layer name is exported as `COLOPHON_STYLE_LAYER` so you need not hardcode
it. Cascade layers are supported everywhere the container queries in this
stylesheet already require, so this adds no browser floor.

**There is an opt-out.** Injection is idempotent by element id: if an element
with that id already exists, nothing is added. So an app that inserts its own
`<style>` under that id before Colophon renders replaces the stylesheet
wholesale.

```ts
import {
  COLOPHON_STYLE_ELEMENT_ID,
  ensureColophonStyles,
} from '@brnby/plugin-colophon-react';

const style = document.createElement('style');
style.id = COLOPHON_STYLE_ELEMENT_ID;
style.textContent = myOwnColophonCss;
document.head.appendChild(style);
```

`ensureColophonStyles()` is the non-hook form of `useColophonStyles()`, for
call sites that are not components. Taking the opt-out means taking on layout,
navigation state, the container queries and the cascade layer as well as the
prose rules — it is all one sheet.

## What is not overridable

Stated plainly, because an extension point nobody can find is worse than an
honest limit:

- **Inline formatting.** `em`, `strong`, `del` and `sup` have no slot, by the
  rule above. Style them; you cannot replace them. `hr` and `tbody` are the
  two block-level constructs in the same position.
- **Extra properties on an element that has a slot.** A rehype plugin can add
  a class to an `h2`, but the `heading` slot's props are a fixed contract and
  it stops there.
- **The page shell.** Navigation, table of contents, page header and their
  arrangement in `DocsBrowser` are not composable. `ColophonMarkdown`,
  `ColophonNav`, `ColophonToc` and `ColophonPageHeader` are exported
  individually, so building a different shell out of them is the escape hatch;
  `ColophonMarkdown` also takes a `className` for your own prose rules.
- **The docs home listing.** The bundle list, its filter and its row layout are
  fixed.
- **Where the stylesheet is inserted.** Nothing exposes a target element. The
  cascade layer means insertion point no longer decides who wins, so this is
  a limit rather than a problem.
