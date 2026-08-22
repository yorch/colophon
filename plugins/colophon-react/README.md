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

Releases go out under both the `latest` and `next` dist-tags; both currently
point at `0.1.0`.

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

Overridable slots are `code`, `codeBlock`, `link`, `image`, `heading`, `table`
and `codeLanguages`; `defaultColophonComponents` is exported if you want to
wrap a default rather than replace it.

## Also exported

`ColophonNav`, `ColophonToc`, `ColophonPageHeader` and `ColophonSearchResults`,
which are the rest of a documentation page; `MermaidDiagram`;
`colophonSanitizeSchema`, the rehype-sanitize schema the renderer runs with;
and `useAnchorScroll` / `useContainerWidth`.

## Status

Early development. The bundle contract is not yet stable, and these component
APIs may change with it.

## License

[MIT](LICENSE) © Jorge Barnaby
