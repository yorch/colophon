import { posix } from 'node:path';
import { type NavNode, slugFromPath } from '@brnby/colophon-common';
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
  return pages.some(page => page.slug === '')
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
      if (isExternal(reference.url)) {
        continue;
      }
      const [target, fragment] = splitFragment(reference.url);

      // A bare fragment points within the current page.
      if (!target) {
        if (fragment && !anchorsBySlug.get(page.slug)?.has(fragment)) {
          diagnostics.push({
            level: 'error',
            message: `link to "#${fragment}" does not match any heading on this page`,
            path: page.path,
          });
        }
        continue;
      }

      const resolved = resolveRelative(page.path, target);
      if (reference.kind === 'image' || !/\.mdx?$/i.test(target)) {
        if (!assetPaths.has(resolved) && !slugs.has(slugFromPath(resolved))) {
          diagnostics.push({
            level: 'error',
            message: `references "${reference.url}", which is not a file in this bundle`,
            path: page.path,
          });
        }
        continue;
      }

      const targetSlug = slugFromPath(resolved);
      if (!slugs.has(targetSlug)) {
        diagnostics.push({
          level: 'error',
          message: `links to "${reference.url}", which is not a page in this bundle`,
          path: page.path,
        });
        continue;
      }
      if (fragment && !anchorsBySlug.get(targetSlug)?.has(fragment)) {
        diagnostics.push({
          level: 'error',
          message: `links to "${reference.url}", but that page has no heading "#${fragment}"`,
          path: page.path,
        });
      }
    }
  }

  return diagnostics;
}

function isExternal(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
}

function splitFragment(url: string): [string, string | undefined] {
  const index = url.indexOf('#');
  const target = index === -1 ? url : url.slice(0, index);
  const fragment = index === -1 ? undefined : url.slice(index + 1);
  // The target is decoded as well as the fragment. Percent-encoding is the
  // ordinary way to link a filename containing a space, and comparing the
  // raw "my%20guide.md" against a real "my guide.md" reported a broken link
  // and failed the publish.
  return [decodeSafely(target), fragment && decodeSafely(fragment)];
}

/** Malformed escapes are left as-is rather than throwing URIError. */
function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Resolves a link relative to the linking page, staying inside the bundle. */
function resolveRelative(fromPath: string, target: string): string {
  if (target.startsWith('/')) {
    return target.replace(/^\/+/, '');
  }
  return posix.normalize(posix.join(posix.dirname(fromPath), target));
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some(diagnostic => diagnostic.level === 'error');
}
