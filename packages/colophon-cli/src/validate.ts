import {
  isEntrySlug,
  type NavNode,
  resolveReference,
  slugFromPath,
} from '@brnby/colophon-common';
import { reachableSlugs } from './nav';
import type { AssetDraft, Diagnostic, PageDraft } from './types';

export interface ValidateOptions {
  pages: PageDraft[];
  assets: AssetDraft[];
  nav: NavNode[];
  /** Promotes advisory diagnostics to errors. */
  strict?: boolean;
}

/**
 * Rejects malformed input at the publishing boundary.
 *
 * The bundle is a contract with three downstream consumers — the renderer,
 * the search collator, and the MCP tools — and each would otherwise invent
 * its own handling for a broken link. Failing here means the backend can
 * assume well-formed input, which removes a surprising amount of defensive
 * code from all three.
 */
export function validate(options: ValidateOptions): Diagnostic[] {
  const { pages, assets, nav, strict = false } = options;
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(...checkDuplicateSlugs(pages));
  diagnostics.push(...checkTitles(pages));
  diagnostics.push(...checkRoot(pages));
  diagnostics.push(...checkReferences(pages, assets));
  diagnostics.push(...checkDescriptions(pages, strict));
  diagnostics.push(...checkOrphans(pages, nav));

  return diagnostics;
}

/**
 * `guides/index.md` and `guides.md` both address `guides`, so one of them
 * would be unreachable. Publishing that silently means an author's edits go
 * nowhere, which is far worse than a failed build.
 */
function checkDuplicateSlugs(pages: PageDraft[]): Diagnostic[] {
  const bySlug = new Map<string, PageDraft[]>();
  for (const page of pages) {
    const group = bySlug.get(page.slug);
    if (group) {
      group.push(page);
    } else {
      bySlug.set(page.slug, [page]);
    }
  }
  return [...bySlug.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([slug, group]) => ({
      level: 'error' as const,
      message: `${group
        .map(p => p.path)
        .join(' and ')} both resolve to the slug "${slug}"`,
    }));
}

/**
 * The title fallback chain (frontmatter -> first H1 -> humanized filename)
 * only fails for a degenerate filename like `---.md`, which humanizes to
 * the empty string — narrow, but `parseManifest` would otherwise reject it
 * deep inside `build()` with a much less actionable message.
 */
function checkTitles(pages: PageDraft[]): Diagnostic[] {
  return pages
    .filter(page => !page.title.trim())
    .map(page => ({
      level: 'error' as const,
      message: 'Missing title',
      path: page.path,
    }));
}

function checkRoot(pages: PageDraft[]): Diagnostic[] {
  if (pages.length === 0) {
    // An empty bundle is almost always a wrong --docs-dir, a too-broad
    // exclude, or a build that produced nothing. Publishing it repoints the
    // channel at a revision with no pages, which reads to everyone else as
    // the documentation having been deleted.
    return [
      {
        level: 'error',
        message:
          'no pages found; publishing this would empty the bundle. Check the docs directory and any exclude patterns',
      },
    ];
  }
  return pages.some(page => isEntrySlug(page.slug))
    ? []
    : [
        {
          level: 'warning',
          message:
            'no index.md at the docs root, so the bundle has no landing page',
        },
      ];
}

function checkDescriptions(pages: PageDraft[], strict: boolean): Diagnostic[] {
  // A weak description is what makes an agent fetch a whole page to find out
  // it was the wrong one, so this is advisory by default and fatal under
  // --strict once a team has adopted the convention.
  return pages
    .filter(page => !page.description)
    .map(page => ({
      level: strict ? ('error' as const) : ('warning' as const),
      message: 'missing frontmatter description',
      path: page.path,
    }));
}

function checkOrphans(pages: PageDraft[], nav: NavNode[]): Diagnostic[] {
  const reachable = reachableSlugs(nav);
  return pages
    .filter(page => !reachable.has(page.slug))
    .map(page => ({
      level: 'warning' as const,
      message: 'page is not reachable from the navigation',
      path: page.path,
    }));
}

function checkReferences(
  pages: PageDraft[],
  assets: AssetDraft[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const slugs = new Set(pages.map(page => page.slug));
  const anchorsBySlug = new Map(
    pages.map(page => [
      page.slug,
      new Set(page.headings.map(heading => heading.anchor)),
    ]),
  );
  const assetPaths = new Set(assets.map(asset => asset.path));

  for (const page of pages) {
    for (const reference of page.references) {
      // Resolution comes from the contract, so the link this blesses is the
      // one the renderer will follow. Deciding it here independently is how
      // a publish can succeed while every link 404s in the portal.
      const resolved = resolveReference(page.path, reference.url);

      if (resolved.kind === 'external') {
        continue;
      }

      if (resolved.kind === 'anchor') {
        if (
          resolved.anchor &&
          !anchorsBySlug.get(page.slug)?.has(resolved.anchor)
        ) {
          diagnostics.push({
            level: 'error',
            message: `link to "#${resolved.anchor}" does not match any heading on this page`,
            path: page.path,
            line: reference.line,
          });
        }
        continue;
      }

      if (resolved.kind === 'asset') {
        // A link written without an extension may still mean a page.
        if (
          !assetPaths.has(resolved.path) &&
          !slugs.has(slugFromPath(resolved.path))
        ) {
          diagnostics.push({
            level: 'error',
            message: `references "${reference.url}", which is not a file in this bundle`,
            path: page.path,
            line: reference.line,
          });
        }
        continue;
      }

      if (!slugs.has(resolved.slug)) {
        diagnostics.push({
          level: 'error',
          message: `links to "${reference.url}", which is not a page in this bundle`,
          path: page.path,
          line: reference.line,
        });
        continue;
      }
      if (
        resolved.anchor &&
        !anchorsBySlug.get(resolved.slug)?.has(resolved.anchor)
      ) {
        diagnostics.push({
          level: 'error',
          message: `links to "${reference.url}", but that page has no heading "#${resolved.anchor}"`,
          path: page.path,
          line: reference.line,
        });
      }
    }
  }

  return diagnostics;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some(diagnostic => diagnostic.level === 'error');
}
