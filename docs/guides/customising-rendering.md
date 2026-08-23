---
title: Customising rendering
description: Replacing rendered components, theming through Backstage UI tokens, and what Colophon does not let you change.
type: how-to
tags: [customisation, frontend]
---

# Customising rendering

Colophon renders Markdown at read time rather than baking HTML at build time,
which is what makes this possible at all: the renderer is a React component
tree, so an adopter replaces a component instead of fighting CSS specificity
against HTML someone else already emitted.

Two knobs, in the order you should reach for them:

1. **Design tokens** — brand colours, spacing and fonts follow the Backstage UI
   theme already, so most portals need nothing here.
2. **Component overrides** — replace how one kind of Markdown node renders.

## The override slots

Seven slots, all optional. Anything left out keeps the shipped default.

| Slot | Renders | Props |
| --- | --- | --- |
| `code` | inline code spans | `{ value }` |
| `codeBlock` | fenced blocks with no registered language | `{ language, value }` |
| `link` | Markdown links | `{ href, title, children }` |
| `image` | Markdown images | `{ src, alt, title }` |
| `heading` | `#`…`######` | `{ depth, id, children }` |
| `table` | GFM tables (the wrapper, not the interior) | `{ children }` |
| `codeLanguages` | fenced blocks keyed by language | `Record<string, ComponentType<CodeBlockProps>>` |

`codeLanguages` is why Mermaid is not special-cased anywhere in the renderer:
it is the handler registered under `mermaid`, and PlantUML or Vega plug in the
same way. It merges key by key, so registering `plantuml` does not
unregister `mermaid`.

Providers **nest rather than replace**. An inner provider that overrides `link`
keeps an outer provider's `code`, which is what lets a portal set defaults once
while a single page still swaps one component.

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

**Injection order is not guaranteed.** The element is appended whenever the
first Colophon component mounts, which for a lazily-loaded route is after your
app's own stylesheets. Rules of equal specificity that arrive later win, so
Colophon's may override yours. Beat it on specificity rather than on order —
`.my-app .colophon-markdown p` rather than `.colophon-markdown p`.

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
navigation state and the container queries as well as the prose rules — it is
all one sheet.

## What is not overridable

Stated plainly, because an extension point nobody can find is worse than an
honest limit:

- **Slots outside the seven above.** Blockquotes, lists, list items, paragraphs
  and the interior of tables (`thead`, `tr`, `td`) render as plain HTML with
  Colophon's classes. Style them; you cannot replace them.
- **The Markdown pipeline.** `remarkPlugins`, `rehypePlugins` and the sanitize
  schema are fixed. Footnotes, custom directives and admonition syntax are not
  reachable from outside the package.
- **The page shell.** Navigation, table of contents, page header and their
  arrangement in `DocsBrowser` are not composable. `ColophonMarkdown`,
  `ColophonNav`, `ColophonToc` and `ColophonPageHeader` are exported
  individually, so building a different shell out of them is the escape hatch;
  `ColophonMarkdown` also takes a `className` for your own prose rules.
- **The docs home listing.** The bundle list, its filter and its row layout are
  fixed.
- **Stylesheet injection order.** Nothing exposes a cascade layer or a target
  element; the opt-out above is all there is.
