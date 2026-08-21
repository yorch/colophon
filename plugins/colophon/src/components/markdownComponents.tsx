import { useApi } from '@backstage/core-plugin-api';
import { Link } from '@backstage/ui';
import { resolveReference } from '@brnby/colophon-common';
import type {
  ColophonComponents,
  ImageProps,
  LinkProps,
} from '@brnby/plugin-colophon-react';
import { useEffect, useMemo, useState } from 'react';
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
 * Link and image overrides that resolve relative references.
 *
 * The renderer deliberately hands hrefs through as authored, because
 * resolution needs routing context it does not have. This is the consumer
 * that has it — and until it existed, every `[x](./y.md)` and every
 * `![](_assets/z.png)` in every published page resolved against the browser's
 * path and 404'd, even though the publisher had verified both.
 */
export function useMarkdownComponents(
  context: MarkdownContext,
): ColophonComponents {
  return useMemo(
    () => ({
      link: props => <ResolvedLink {...props} context={context} />,
      image: props => <ResolvedImage {...props} context={context} />,
    }),
    [context],
  );
}

function ResolvedLink({
  href,
  title,
  children,
  context,
}: LinkProps & { context: MarkdownContext }) {
  const resolved = href
    ? resolveReference(context.fromPath, href)
    : { kind: 'external' as const, href: '' };

  if (resolved.kind === 'external') {
    return (
      <Link href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </Link>
    );
  }

  if (resolved.kind === 'anchor') {
    // Left as a plain fragment so the browser scrolls natively. Routing it
    // would resolve the anchor against the current path instead.
    return (
      <a
        className="colophon-toc-link"
        href={`#${resolved.anchor}`}
        title={title}
      >
        {children}
      </a>
    );
  }

  if (resolved.kind === 'page') {
    const base = context.hrefForSlug(resolved.slug);
    return (
      <Link
        href={resolved.anchor ? `${base}#${resolved.anchor}` : base}
        title={title}
      >
        {children}
      </Link>
    );
  }

  return (
    <AssetLink path={resolved.path} title={title} context={context}>
      {children}
    </AssetLink>
  );
}

function AssetLink({
  path,
  title,
  children,
  context,
}: {
  path: string;
  title?: string;
  children: React.ReactNode;
  context: MarkdownContext;
}) {
  const href = useAssetUrl(context, path);
  return (
    <Link href={href ?? '#'} title={title}>
      {children}
    </Link>
  );
}

function ResolvedImage({
  src,
  alt,
  title,
  context,
}: ImageProps & { context: MarkdownContext }) {
  const resolved = src
    ? resolveReference(context.fromPath, src)
    : { kind: 'external' as const, href: '' };
  const assetPath = resolved.kind === 'asset' ? resolved.path : undefined;
  const assetUrl = useAssetUrl(context, assetPath);

  const finalSrc =
    resolved.kind === 'external' ? resolved.href : (assetUrl ?? undefined);

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
 * Asset URLs come from the API client rather than being built here.
 *
 * The client owns the URL shape, including the bucket prefix and the channel
 * parameter, and it resolves the backend's base address through discovery,
 * which is asynchronous. Resolving per asset keeps that ownership in one
 * place; pages carry few enough images for the extra effect to be irrelevant.
 */
function useAssetUrl(
  context: MarkdownContext,
  path: string | undefined,
): string | undefined {
  const api = useApi(colophonApiRef);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!path) {
      setUrl(undefined);
      return undefined;
    }
    let cancelled = false;
    api
      .assetUrl(context.bundleId, path, context.channel)
      .then(next => !cancelled && setUrl(next))
      // A broken image is a broken image; it must not take the page down.
      .catch(() => !cancelled && setUrl(undefined));
    return () => {
      cancelled = true;
    };
  }, [api, context.bundleId, context.channel, path]);

  return url;
}
