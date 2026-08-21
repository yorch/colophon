import { parseEntityRef } from '@backstage/catalog-model';
import { DEFAULT_CHANNEL } from '@brnby/colophon-common';

/**
 * Portal URLs for a page.
 *
 * Every search result an agent receives carries one of these, because an
 * answer an engineer cannot verify against the source is worth very little.
 * Entity-scoped links are preferred when the bundle is attached to a catalog
 * entity — that is the page a human would have navigated to anyway.
 */
export function pageUrl(options: {
  appBaseUrl: string;
  bundleId: string;
  slug: string;
  channel?: string;
  anchor?: string;
  entityRef?: string;
}): string {
  const base = options.appBaseUrl.replace(/\/+$/, '');
  const path = options.entityRef
    ? `${entityDocsPath(options.entityRef)}/${options.slug}`
    : `/colophon/${encodeURIComponent(options.bundleId)}/${options.slug}`;
  const query =
    options.channel && options.channel !== DEFAULT_CHANNEL
      ? `?channel=${encodeURIComponent(options.channel)}`
      : '';
  const anchor = options.anchor ? `#${options.anchor}` : '';
  return `${base}${path.replace(/\/+$/, '')}${query}${anchor}`;
}

function entityDocsPath(entityRef: string): string {
  const { kind, namespace, name } = parseEntityRef(entityRef);
  return `/catalog/${encodeURIComponent(namespace)}/${encodeURIComponent(
    kind.toLowerCase(),
  )}/${encodeURIComponent(name)}/docs`;
}
