import { appThemeApiRef, useApiHolder } from '@backstage/core-plugin-api';
import { Text } from '@backstage/ui';
import { useEffect, useId, useState } from 'react';
import { useColophonStyles } from '../styles';
import type { CodeBlockProps } from '../types';

/**
 * Renders a ```mermaid fence.
 *
 * Two things drive the shape of this component:
 *
 * 1. Mermaid is roughly half a megabyte. It is loaded with a dynamic `import()`
 *    so it lands in its own chunk and a page with no diagrams never pays for
 *    it.
 * 2. Mermaid bakes theme colours into the SVG at render time, so a theme switch
 *    has to re-render the diagram rather than restyle it. `themeVariant` is
 *    therefore part of the effect's dependency list.
 */

type RenderState =
  | { status: 'rendering' }
  | { status: 'ok'; svg: string }
  | { status: 'failed' };

/** Resolves the app's current light/dark variant, if an app theme is present. */
export function useThemeVariant(): 'light' | 'dark' {
  // `useApiHolder` rather than `useApi` because the renderer is also usable
  // outside a full Backstage app, where no app theme api is registered.
  const appThemeApi = useApiHolder().get(appThemeApiRef);
  const [variant, setVariant] = useState<'light' | 'dark'>(() =>
    resolveVariant(appThemeApi?.getActiveThemeId()),
  );

  useEffect(() => {
    if (!appThemeApi) {
      return undefined;
    }
    const resolve = (themeId: string | undefined) =>
      appThemeApi.getInstalledThemes().find(t => t.id === themeId)?.variant ??
      resolveVariant(themeId);

    setVariant(resolve(appThemeApi.getActiveThemeId()));
    const subscription = appThemeApi
      .activeThemeId$()
      .subscribe(themeId => setVariant(resolve(themeId)));
    return () => subscription.unsubscribe();
  }, [appThemeApi]);

  return variant;
}

function resolveVariant(themeId: string | undefined): 'light' | 'dark' {
  if (themeId?.includes('dark')) {
    return 'dark';
  }
  if (themeId?.includes('light')) {
    return 'light';
  }
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Removes whatever mermaid left in the document after a failed render.
 *
 * `render()` builds its SVG in a detached-looking scratch element appended to
 * `<body>` (`#d<id>`) and removes it only on success. On a syntax error it
 * stays, error "bomb" and all, positioned over the page — outside this
 * component, so nothing React owns can clear it.
 */
function removeLeakedRenderElements(renderId: string) {
  for (const id of [renderId, `d${renderId}`, `i${renderId}`]) {
    document.getElementById(id)?.remove();
  }
}

/** `graph TD;` -> "graph", for a screen reader's idea of what this image is. */
function diagramKind(source: string): string {
  return /^\s*([A-Za-z][\w-]*)/.exec(source)?.[1] ?? 'diagram';
}

export function MermaidDiagram(props: CodeBlockProps) {
  useColophonStyles();
  const { value } = props;
  const themeVariant = useThemeVariant();
  // `useId` gives mermaid a DOM-safe unique id per instance; mermaid rejects
  // ids containing the colons React generates, so they are stripped.
  const renderId = `colophon-mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [state, setState] = useState<RenderState>({ status: 'rendering' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'rendering' });

    (async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: themeVariant === 'dark' ? 'dark' : 'default',
        // Without this a syntax error renders mermaid's own error graphic into
        // the page instead of throwing; the fallback below is ours to draw.
        suppressErrorRendering: true,
      });
      // Parse first so an invalid diagram fails before render() has built
      // anything to leak.
      await mermaid.parse(value);
      const { svg } = await mermaid.render(renderId, value);
      if (!cancelled) {
        setState({ status: 'ok', svg });
      }
    })().catch(() => {
      removeLeakedRenderElements(renderId);
      if (!cancelled) {
        setState({ status: 'failed' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [value, themeVariant, renderId]);

  if (state.status === 'failed') {
    // A broken diagram must never take the page with it: fall back to the
    // source, which is still the most useful thing we can show the reader.
    return (
      <figure
        className="colophon-mermaid colophon-mermaid-fallback"
        data-testid="mermaid-fallback"
      >
        <pre className="colophon-code-block">
          <code>{value}</code>
        </pre>
        {/* Deliberately not the parser's message: it is a multi-line dump
            about a grammar the author may never have seen, and not a reason
            to colour the page red. The source above is the useful part. */}
        <figcaption>
          <Text variant="body-small" color="secondary">
            This diagram could not be rendered, so its source is shown instead.
          </Text>
        </figcaption>
      </figure>
    );
  }

  if (state.status === 'rendering') {
    return (
      <div
        className="colophon-mermaid colophon-mermaid-pending"
        data-testid="mermaid-rendering"
        role="status"
        aria-busy="true"
      >
        <Text variant="body-small" color="secondary">
          Rendering diagram…
        </Text>
      </div>
    );
  }

  return (
    <div
      className="colophon-mermaid"
      data-testid="mermaid-diagram"
      role="img"
      aria-label={`Diagram (${diagramKind(value)})`}
      // Mermaid returns an SVG string and offers no element-returning API. The
      // input reaching it is already sanitised by the markdown pipeline, and
      // mermaid itself runs with securityLevel 'strict', which strips scripts
      // and click handlers from its own output.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: see above
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
