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
  return `${options.appBaseUrl.replace(/\/+$/, '')}${pagePath(options)}`;
}

/**
 * The same location, app-relative.
 *
 * Backstage Search results are rendered with a router-aware Link, which sends
 * an absolute URL to a new browser tab because it cannot know the origin is
 * its own. Portal results therefore carry a path; only consumers OUTSIDE the
 * app — the MCP tools, whose reader has no app to be inside — need the origin.
 */
export function pagePath(options: {
  bundleId: string;
  slug: string;
  channel?: string;
  anchor?: string;
  entityRef?: string;
}): string {
  // Both a bundle id and a slug contain slashes, so only one of them can live
  // in the path without becoming ambiguous. The bundle id takes the path,
  // because the frontend route is /colophon/* and reads the whole remainder as
  // the id; the page travels as a query parameter; and the fragment is left
  // free for a heading anchor, which is the one thing a fragment is actually
  // for. Percent-encoding the id instead would be prettier but relies on the
  // router preserving %2F through the splat, which is not dependable.
  const path = options.entityRef
    ? entityDocsPath(options.entityRef)
    : `/colophon/${options.bundleId}`;

  const query = new URLSearchParams();
  if (options.slug) {
    query.set('page', options.slug);
  }
  if (options.channel && options.channel !== DEFAULT_CHANNEL) {
    query.set('channel', options.channel);
  }

  const search = query.toString();
  const anchor = options.anchor ? `#${encodeURIComponent(options.anchor)}` : '';
  return `${path}${search ? `?${search}` : ''}${anchor}`;
}

function entityDocsPath(entityRef: string): string {
  const { kind, namespace, name } = parseEntityRef(entityRef);
  return `/catalog/${encodeURIComponent(namespace)}/${encodeURIComponent(
    kind.toLowerCase(),
  )}/${encodeURIComponent(name)}/docs`;
}
