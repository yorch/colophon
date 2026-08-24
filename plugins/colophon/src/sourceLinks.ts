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

  // Every field that becomes a path SEGMENT, checked before any of them is
  // concatenated. Checking only `pagePath` left the other two able to move
  // the docs root itself: `source.path: '../../..'` produced a link to the
  // repository owner's namespace, and `source.ref: 'main/../../..'` did the
  // same one level down.
  //
  // `source.url` is deliberately not here. It is a whole URL rather than a
  // segment, so the URL constructor normalises any `..` in it before `byUrl`
  // matches the host — and the host match is the only bound that means
  // anything, since a publisher can name a different repository outright.
  if ([pagePath, source.path, source.ref].some(climbsOut)) {
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

  // Backstop for anything the segment checks above did not anticipate —
  // `resolveUrl` only rejects traversal for paths beginning with `/`, and a
  // relative `../..` is handed to the URL constructor, which walks up
  // happily. Providers normalise the resolved URL (GitHub rewrites it to
  // `/tree/`), so the comparison is against the same normalisation rather
  // than against the raw base.
  if (!viewUrl.startsWith(scm.resolveUrl({ url: './', base: docsRoot }))) {
    return undefined;
  }

  return { viewUrl, editUrl: scm.resolveEditUrl(viewUrl) };
}

/**
 * Whether a manifest field would climb out of the docs root once resolved.
 *
 * This is a CORRECTNESS guard, not a security boundary, and the distinction
 * is worth stating because the code looks like the latter. Whoever publishes
 * a bundle can already point `source.url` at any repository they like — no
 * traversal required — and `scm.byUrl` bounds the result to a host this
 * portal is configured to integrate with either way. What this prevents is a
 * malformed manifest producing a link that looks plausible and goes to the
 * wrong place, which is the failure nobody reports because it reads as
 * intentional.
 *
 * Decoding first is the point. The WHATWG URL parser leaves `%2f` and `%5c`
 * alone, so `..%2f..%2f..%2fetc/passwd` stays a single literal segment and
 * sails through a containment check on the composed string — while a provider
 * that decodes before routing would see the traversal. A value that will not
 * decode at all cannot be shown to be safe, so it is refused; a documentation
 * filename containing a bare `%` is rare enough that losing its link is the
 * better trade.
 */
function climbsOut(value: string): boolean {
  let decoded = value;
  let previous: string;
  do {
    previous = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return true;
    }
  } while (decoded !== previous);
  return decoded.split(/[/\\]/).some(segment => segment === '..');
}

/** Joins URL segments with exactly one slash between each. */
function join(...parts: string[]): string {
  return parts
    .map(part => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}
