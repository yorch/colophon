import {
  type NavEntrySpec,
  type NavNode,
  slugFromPath,
} from '@brnby/colophon-common';
import { humanize } from './humanize';
import type { Diagnostic, PageDraft } from './types';

/**
 * Builds the navigation tree.
 *
 * `docs.yaml` wins when it declares a nav, because an explicit ordering is
 * always a deliberate one. Otherwise the tree is derived from the directory
 * layout, which is what keeps adoption cheap — dropping a markdown file in a
 * folder is the whole workflow.
 */
export function buildNav(
  pages: PageDraft[],
  spec: NavEntrySpec[] | undefined,
): { nav: NavNode[]; diagnostics: Diagnostic[] } {
  if (spec && spec.length > 0) {
    return buildExplicitNav(pages, spec);
  }
  return { nav: buildDerivedNav(pages), diagnostics: [] };
}

function buildExplicitNav(
  pages: PageDraft[],
  spec: NavEntrySpec[],
): { nav: NavNode[]; diagnostics: Diagnostic[] } {
  const bySlug = new Map(pages.map(page => [page.slug, page]));
  const diagnostics: Diagnostic[] = [];

  const convert = (entries: NavEntrySpec[]): NavNode[] =>
    entries.map(entry => {
      const children = entry.children ? convert(entry.children) : undefined;
      if (!entry.page) {
        return { title: entry.title ?? 'Untitled', children };
      }
      const slug = slugFromPath(entry.page);
      const page = bySlug.get(slug);
      if (!page) {
        diagnostics.push({
          level: 'error',
          message: `docs.yaml nav references "${entry.page}", which is not a page in this bundle`,
        });
      }
      return {
        title: entry.title ?? page?.title ?? humanize(slug || 'home'),
        slug,
        children,
      };
    });

  return { nav: convert(spec), diagnostics };
}

interface TreeNode {
  segment: string;
  page?: PageDraft;
  children: Map<string, TreeNode>;
}

function buildDerivedNav(pages: PageDraft[]): NavNode[] {
  const root: TreeNode = { segment: '', children: new Map() };

  for (const page of pages) {
    const segments = page.slug ? page.slug.split('/') : [];
    let node = root;
    for (const segment of segments) {
      let next = node.children.get(segment);
      if (!next) {
        next = { segment, children: new Map() };
        node.children.set(segment, next);
      }
      node = next;
    }
    // A directory's index.md collapses onto the directory node itself, so
    // `guides/index.md` titles the "Guides" group rather than nesting inside.
    node.page = page;
  }

  // The docs-root index.md has the empty slug and so has no tree segment of
  // its own. It leads the nav rather than being dropped, which both gives the
  // landing page a way back and keeps it from looking like an orphan.
  const landing: NavNode[] = root.page
    ? [{ title: root.page.title, slug: root.page.slug }]
    : [];
  return [...landing, ...toNavNodes(root)];
}

function toNavNodes(node: TreeNode): NavNode[] {
  const children = [...node.children.values()];
  children.sort(compareNodes);
  return children.map(child => {
    const nested = toNavNodes(child);
    return {
      title: child.page?.title ?? humanize(child.segment),
      ...(child.page ? { slug: child.page.slug } : {}),
      ...(nested.length > 0 ? { children: nested } : {}),
    };
  });
}

/** Explicit nav_order first, then title — so authors can promote a page
 * without having to order every one of its siblings. */
function compareNodes(a: TreeNode, b: TreeNode): number {
  const orderA = a.page?.navOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.page?.navOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  const titleA = a.page?.title ?? humanize(a.segment);
  const titleB = b.page?.title ?? humanize(b.segment);
  // Codepoint order, NOT localeCompare's default. Nav order feeds the
  // manifest identity that revisionId is the hash of, so a runner with a
  // Swedish locale would otherwise sort "Ärger" last, mint a different
  // revision for identical documentation, and defeat the idempotence the
  // whole content-addressing scheme exists to provide.
  if (titleA === titleB) {
    return 0;
  }
  return titleA < titleB ? -1 : 1;
}

/** Every slug reachable from the nav, used to spot orphaned pages. */
export function reachableSlugs(nav: NavNode[]): Set<string> {
  const seen = new Set<string>();
  const walk = (nodes: NavNode[]) => {
    for (const node of nodes) {
      if (node.slug !== undefined) {
        seen.add(node.slug);
      }
      if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(nav);
  return seen;
}
