import { useApi } from '@backstage/core-plugin-api';
import { Link } from '@backstage/ui';
import { resolveReference } from '@brnby/colophon-common';
import type {
  ColophonComponents,
  ImageProps,
  LinkProps,
} from '@brnby/plugin-colophon-react';
import {
  ColophonComponentsProvider,
  ColophonMarkdown,
  defaultColophonComponents,
  useColophonComponents,
} from '@brnby/plugin-colophon-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { colophonApiRef } from '../api';

export interface MarkdownContext {
  bundleId: string;
  /** Path of the page being rendered, which relative hrefs resolve against. */
  fromPath: string;
  channel?: string;
  /** Builds the portal href for another page in this bundle. */
  hrefForSlug: (slug: string) => string;
}

/**
 * Which page is being rendered, for the components rendering inside it.
 *
 * Passed through context rather than through props so that an ADOPTER's `link`
 * override — which Colophon never sees and cannot hand props to — can resolve
 * relative references the same way the built-in one does, by calling
 * {@link useColophonReference}.
 */
const MarkdownPageContext = createContext<MarkdownContext | undefined>(
  undefined,
);

/** Where a markdown reference points once resolved against its page. */
export interface ColophonReference {
  /**
   * How the authored reference was classified. `external` targets leave the
   * portal and want the usual `target="_blank"` tabnabbing guard; `anchor`
   * targets must stay bare fragments so the browser scrolls natively.
   */
  kind: 'external' | 'anchor' | 'page' | 'asset';
  /**
   * The href or src to use. Undefined while an asset URL is still being
   * looked up, and for an asset whose lookup failed.
   */
  href: string | undefined;
}

/**
 * Resolves a markdown href or src against the page it was authored on.
 *
 * This is the piece an adopter needs and could not previously get. The
 * renderer hands hrefs through exactly as written, because resolution needs
 * routing context it does not have — so `[x](./y.md)` and `![](_assets/z.png)`
 * are meaningless until something that knows the current page rewrites them.
 * An override that skips this step silently breaks every relative link on
 * every page, which is a trap rather than an extension point.
 *
 * Outside a Colophon page there is no context to resolve against, so the
 * reference is passed through untouched rather than guessed at.
 */
export function useColophonReference(reference?: string): ColophonReference {
  const page = useContext(MarkdownPageContext);
  const resolved = useMemo(
    () =>
      page && reference
        ? resolveReference(page.fromPath, reference)
        : ({ kind: 'external', href: reference ?? '' } as const),
    [page, reference],
  );

  const assetUrl = useAssetUrl(
    page,
    resolved.kind === 'asset' ? resolved.path : undefined,
  );

  if (resolved.kind === 'anchor') {
    return { kind: 'anchor', href: `#${resolved.anchor}` };
  }
  if (resolved.kind === 'asset') {
    return { kind: 'asset', href: assetUrl };
  }
  if (resolved.kind === 'page' && page) {
    const base = page.hrefForSlug(resolved.slug);
    return {
      kind: 'page',
      href: resolved.anchor ? `${base}#${resolved.anchor}` : base,
    };
  }
  return { kind: 'external', href: reference };
}

function ResolvedLink({ href, title, children }: LinkProps) {
  const resolved = useColophonReference(href);

  if (resolved.kind === 'anchor') {
    // Left as a plain fragment so the browser scrolls natively. Routing it
    // would resolve the anchor against the current path instead.
    return (
      <a className="colophon-toc-link" href={resolved.href} title={title}>
        {children}
      </a>
    );
  }

  if (resolved.kind === 'external') {
    return (
      <Link href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </Link>
    );
  }

  return (
    <Link href={resolved.href ?? '#'} title={title}>
      {children}
    </Link>
  );
}

function ResolvedImage({ src, alt, title }: ImageProps) {
  const resolved = useColophonReference(src);
  // A page or an in-page anchor is a document, not an image. Leaving the src
  // empty renders the alt text; pointing an <img> at markdown renders a
  // broken-image icon and hides the alt text behind it.
  const finalSrc =
    resolved.kind === 'external' || resolved.kind === 'asset'
      ? resolved.href
      : undefined;

  return (
    <img
      className="colophon-markdown-image"
      src={finalSrc}
      alt={alt}
      title={title}
      loading="lazy"
    />
  );
}

/**
 * Link and image overrides that resolve relative references — but only for the
 * slots the app has not claimed.
 *
 * These used to be installed unconditionally as the innermost provider, which
 * meant an adopter's `link` or `image` override was always shadowed: five of
 * the seven slots were overridable and these two silently were not.
 *
 * The registry merges outer-to-inner, and Colophon's provider is necessarily
 * the inner one — the app's provider is an ancestor, and the context carries
 * only the merged result, so there is no way to re-apply the app's overrides
 * on top from in here. Composition is therefore done by asking instead: a slot
 * still holding the shipped default is unclaimed, so Colophon fills it; a slot
 * holding anything else belongs to the app and is left alone. That adopter's
 * component resolves references by calling {@link useColophonReference}.
 */
function useResolvingComponents(): ColophonComponents {
  const ambient = useColophonComponents();
  const ownsLink = ambient.link === defaultColophonComponents.link;
  const ownsImage = ambient.image === defaultColophonComponents.image;

  // `undefined` is how the registry spells "leave this slot as it is".
  return useMemo(
    () => ({
      link: ownsLink ? ResolvedLink : undefined,
      image: ownsImage ? ResolvedImage : undefined,
    }),
    [ownsLink, ownsImage],
  );
}

export interface PageMarkdownProps {
  context: MarkdownContext;
  content: string;
}

/** One page of markdown, with its relative references resolvable. */
export function PageMarkdown({ context, content }: PageMarkdownProps) {
  const components = useResolvingComponents();
  return (
    <MarkdownPageContext.Provider value={context}>
      <ColophonComponentsProvider components={components}>
        <ColophonMarkdown content={content} />
      </ColophonComponentsProvider>
    </MarkdownPageContext.Provider>
  );
}

/**
 * Asset URLs come from the API client rather than being built here.
 *
 * The client owns the URL shape, including the bucket prefix and the channel
 * parameter, and it resolves the backend's base address through discovery,
 * which is asynchronous. Resolving per asset keeps that ownership in one
 * place; pages carry few enough images for the extra effect to be irrelevant.
 */
function useAssetUrl(
  context: MarkdownContext | undefined,
  path: string | undefined,
): string | undefined {
  const api = useApi(colophonApiRef);
  const [url, setUrl] = useState<string>();
  const bundleId = context?.bundleId;
  const channel = context?.channel;

  useEffect(() => {
    if (!path || !bundleId) {
      setUrl(undefined);
      return undefined;
    }
    let cancelled = false;
    api
      .assetUrl(bundleId, path, channel)
      .then(next => !cancelled && setUrl(next))
      // A broken image is a broken image; it must not take the page down.
      .catch(() => !cancelled && setUrl(undefined));
    return () => {
      cancelled = true;
    };
  }, [api, bundleId, channel, path]);

  return url;
}
