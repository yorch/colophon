# @brnby/plugin-colophon-react

The shared Colophon rendering surface: the Markdown renderer, the navigation
and table-of-contents components, and the component override registry that
makes all of them restyleable in one place.

This is a Backstage *web library*, not a plugin — there is nothing to add to
`createApp`. Install it if you are building your own documentation UI on top of
Colophon, or embedding a rendered page somewhere the
[`@brnby/plugin-colophon`](https://www.npmjs.com/package/@brnby/plugin-colophon)
docs tab does not reach. If you just want the docs tab and the docs home page,
install that plugin instead; it depends on this one.

**[Documentation](https://yorch.github.io/colophon/)** ·
**[Repository](https://github.com/yorch/colophon)**

## Install

```bash
yarn workspace app add @brnby/plugin-colophon-react
```

Releases go out under the `latest` dist-tag, so a plain install gets the
current version.

React 17 or 18 is a peer dependency.

## Usage

Give `ColophonMarkdown` the Markdown as published — frontmatter included, it is
stripped for you, using the same function the publisher and the chunker use, so
all three agree on where a body begins:

```tsx
import { ColophonMarkdown } from '@brnby/plugin-colophon-react';

export function Page({ markdown }: { markdown: string }) {
  return <ColophonMarkdown content={markdown} />;
}
```

Styling comes from a stylesheet the components inject themselves, built
entirely from Backstage UI design tokens, so light and dark themes both follow
the app. `ColophonMarkdown`, `ColophonNav` and `ColophonToc` each call
`useColophonStyles()` on your behalf. Call it yourself only if you are using
the layout classes directly — `colophon-layout-container` and
`colophon-layout`, which are container-query driven so the same components lay
out correctly on a full-width page and inside a cramped entity tab.

## Overriding components

Every block a consumer might want to restyle routes through a registry rather
than through CSS aimed at generated HTML. That is the point of keeping Markdown
as the stored artifact rather than shipping HTML:

```tsx
import {
  ColophonComponentsProvider,
  ColophonMarkdown,
} from '@brnby/plugin-colophon-react';

<ColophonComponentsProvider
  components={{
    link: MyLink,
    codeLanguages: { plantuml: MyPlantUmlBlock },
  }}
>
  <ColophonMarkdown content={markdown} />
</ColophonComponentsProvider>;
```

Providers nest rather than replace: an inner provider that overrides `link`
keeps the outer one's `code`, so an app can set portal-wide defaults while a
single page still swaps one component. `codeLanguages` merges key by key, so
registering `plantuml` does not silently unregister the built-in `mermaid`
handler.

Overridable slots are `code`, `codeBlock`, `link`, `image`, `heading`,
`paragraph`, `blockquote`, `list`, `listItem`, `table`, `tableHead`,
`tableRow`, `tableCell` and `codeLanguages` — the rule is that block-level
constructs get a slot and inline formatting does not.
`defaultColophonComponents` is exported if you want to wrap a default rather
than replace it. An unknown key warns in development builds rather than
sitting there inert.

## Extending the Markdown pipeline

`ColophonPipelineProvider` adds remark or rehype plugins and widens the
sanitisation schema, installed the same way as the component registry:

```tsx
<ColophonPipelineProvider remarkPlugins={[remarkAdmonition]} sanitizeSchema={schema}>
  {children}
</ColophonPipelineProvider>
```

Remark plugins run before sanitisation, so a plugin that emits new elements
needs `sanitizeSchema` widened to match or its output is stripped. Naming
`rehype-sanitize` or `rehype-slug` in `rehypePlugins` is rejected: `unified`
matches plugins by identity, so it would reconfigure the built-in pass rather
than add one.

## Also exported

`ColophonNav`, `ColophonToc`, `ColophonPageHeader` and `ColophonSearchResults`,
which are the rest of a documentation page; `MermaidDiagram`;
`colophonSanitizeSchema`, the rehype-sanitize schema the renderer runs with;
`COLOPHON_STYLE_LAYER`, the cascade layer its stylesheet is emitted into;
and `useAnchorScroll` / `useContainerWidth`.

## Status

Early development. The bundle contract is not yet stable, and these component
APIs may change with it.

## License

[MIT](LICENSE) © Jorge Barnaby
