import { isWithinSubpath } from './ids';
import type { NavNode } from './manifest';

/**
 * Narrows a navigation tree to the subtree an entity is scoped to.
 *
 * Contract rather than a local helper, for the same reason the subpath
 * predicate is: the docs tab renders this and `colophon:list-pages` returns
 * it, so two implementations mean a human and an agent see structurally
 * different navigation for the same entity — and neither can tell.
 *
 * Two strategies, in order:
 *
 *  1. If a nav node addresses the subpath exactly, return its children. That
 *     is the common case and the right one: a tab scoped to `services/billing`
 *     should list billing's pages, not the whole tree with everything else
 *     pruned away and two ancestor groups above it.
 *  2. Otherwise prune. A bundle can have pages under a subpath without a nav
 *     node addressing it — an explicit `docs.yaml` nav that groups differently,
 *     or a subpath naming a directory that has no index page. Returning
 *     nothing there would hide documentation that exists.
 */
export function scopeNavigation(nodes: NavNode[], subpath?: string): NavNode[] {
  if (!subpath) {
    return nodes;
  }

  const exact = findBySlug(nodes, subpath);
  if (exact) {
    return exact.children ?? [exact];
  }

  return prune(nodes, subpath);
}

function findBySlug(nodes: NavNode[], slug: string): NavNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) {
      return node;
    }
    const nested = node.children && findBySlug(node.children, slug);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/**
 * Keeps in-scope pages, and group headers that still lead somewhere.
 *
 * An out-of-scope node that has in-scope descendants is kept as a header with
 * its slug dropped, so the shape survives without offering a link to a page
 * this entity does not own.
 */
function prune(nodes: NavNode[], subpath: string): NavNode[] {
  const kept: NavNode[] = [];
  for (const node of nodes) {
    const children = node.children ? prune(node.children, subpath) : [];
    const inScope =
      node.slug !== undefined && isWithinSubpath(node.slug, subpath);

    if (!inScope && children.length === 0) {
      continue;
    }
    kept.push({
      title: node.title,
      ...(inScope && node.slug !== undefined ? { slug: node.slug } : {}),
      ...(children.length > 0 ? { children } : {}),
    });
  }
  return kept;
}
