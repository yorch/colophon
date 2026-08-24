import type { ScmIntegrationRegistry } from '@backstage/integration';
import type { Source } from '@brnby/colophon-common';

/**
 * "View source" and "Edit this page" targets for a rendered page.
 *
 * The manifest records provenance as four separate fields — repository URL,
 * ref, docs directory, and the page's path within it — and a reader has no
 * way to get from a rendered page back to the Markdown behind it. This turns
 * those fields into links.
 *
 * The work is split with `ScmIntegrationRegistry` deliberately, because the
 * registry does two of the three jobs better than hand-written string
 * concatenation ever does, and cannot do the third at all:
 *
 *   - `byUrl` decides whether the host is one this Backstage is integrated
 *     with. That is what makes self-hosted GitHub Enterprise and GitLab work
 *     without naming their domains here.
 *   - `resolveUrl` joins the page's relative path onto the docs root. It is
 *     repo-root aware, preserves the query string, and rejects the traversal
 *     segments a naive join would happily follow.
 *   - `resolveEditUrl` converts the file URL into that provider's edit URL —
 *     GitHub rewrites `/blob/` to `/edit/`, GitLab rewrites `/-/blob/`,
 *     Bitbucket Cloud appends `?mode=edit&at=<ref>`, and providers with no
 *     edit affordance return the URL unchanged, which is why "view source" is
 *     surfaced alongside rather than instead: on Azure DevOps and Bitbucket
 *     Server the edit URL IS the view URL, and offering only "Edit this page"
 *     would promise something the link does not do.
 *
 * What the registry has no method for is CONSTRUCTING a ref-bearing file URL
 * from a repository URL, a ref and a subdirectory: every integration's
 * `resolveEditUrl` expects to be handed a URL that already points at a file,
 * and the package exports no inverse. So the one provider-shaped step is the
 * table below, and anything not in it gets NO link rather than a guessed one
 * — a missing affordance is recoverable, a link that 404s on every page is
 * the kind of thing nobody reports because it looks intentional.
 */
export interface PageSourceLinks {
  /** The page's Markdown in the provider's web UI. */
  viewUrl: string;
  /** The same file, opened for editing where the provider supports it. */
  editUrl: string;
}

/**
 * How each provider spells "this path, at this ref" between the repository
 * URL and the file path.
 *
 * Keyed on `ScmIntegration.type`, so a self-hosted instance resolves through
 * whichever integration matched the host rather than through its domain.
 * Each entry is the inverse of the rewrite that provider's own
 * `resolveEditUrl` performs, which is what keeps the two in step.
 */
const REF_SEGMENT: Record<string, string> = {
  github: 'blob',
  gitlab: '-/blob',
  gitea: 'src/branch',
  bitbucketCloud: 'src',
};

export function pageSourceLinks(options: {
  scm: ScmIntegrationRegistry;
  source: Source | undefined;
  /** The page's path relative to the docs root, e.g. `guides/deploy.md`. */
  pagePath: string | undefined;
}): PageSourceLinks | undefined {
  const { scm, source, pagePath } = options;
  if (!source?.url || !source.ref || !pagePath) {
    return undefined;
  }

  const integration = scm.byUrl(source.url);
  const segment = integration && REF_SEGMENT[integration.type];
  if (!integration || !segment) {
    return undefined;
  }

  // Trailing slash matters: resolveUrl treats the last segment of a base as a
  // file unless the base ends in one, so without it the docs directory would
  // be replaced by the page path rather than prefixed to it.
  const docsRoot = `${join(source.url, segment, source.ref, source.path)}/`;

  let viewUrl: string;
  try {
    viewUrl = scm.resolveUrl({ url: pagePath, base: docsRoot });
  } catch {
    // A base the integration cannot parse as a repository URL throws rather
    // than returning anything, and that is not worth failing a render over.
    return undefined;
  }

  // resolveUrl only rejects traversal for paths that start with `/`; a
  // RELATIVE `../..` is handed to the URL constructor, which walks up
  // happily. The manifest is written by whoever published the bundle, so a
  // path that climbs out of the docs root is untrusted input that would
  // otherwise produce a link to somewhere else in — or above — the
  // repository. Providers normalise the resolved URL (GitHub rewrites it to
  // `/tree/`), so the containment check is against the same normalisation
  // rather than against the raw base.
  if (!viewUrl.startsWith(scm.resolveUrl({ url: './', base: docsRoot }))) {
    return undefined;
  }

  return { viewUrl, editUrl: scm.resolveEditUrl(viewUrl) };
}

/** Joins URL segments with exactly one slash between each. */
function join(...parts: string[]): string {
  return parts
    .map(part => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}
