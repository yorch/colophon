import { slugFromPath } from './ids';

/**
 * What a markdown link or image points at.
 *
 * This is contract for the same reason frontmatter boundaries are. The
 * publisher resolves every reference to check it exists and REFUSES TO
 * PUBLISH when one does not, so by the time a bundle reaches the portal
 * every link in it has been blessed. If the renderer then resolves them
 * differently, it produces 404s for links the publisher guaranteed — and
 * nothing fails loudly, because both sides believe they are right.
 */
export type ResolvedReference =
  | { kind: 'external'; href: string }
  | { kind: 'page'; slug: string; anchor?: string }
  | { kind: 'anchor'; anchor: string }
  | { kind: 'asset'; path: string };

/** A scheme, a protocol-relative URL, or a mail/tel style link. */
function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

/** Malformed escapes are left alone rather than throwing URIError. */
function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves `href` as written on the page at `fromPath`.
 *
 * `fromPath` is the page's path within the docs directory — `guides/deploy.md`
 * — not its slug, because relative links are written against the file layout
 * an author sees, not the URL space the portal serves.
 */
export function resolveReference(
  fromPath: string,
  href: string,
): ResolvedReference {
  if (isExternal(href)) {
    return { kind: 'external', href };
  }

  const hash = href.indexOf('#');
  const rawTarget = hash === -1 ? href : href.slice(0, hash);
  const anchor = hash === -1 ? undefined : decodeSafely(href.slice(hash + 1));
  const target = decodeSafely(rawTarget);

  // A bare fragment stays on the current page.
  if (!target) {
    return { kind: 'anchor', anchor: anchor ?? '' };
  }

  const path = resolvePath(fromPath, target);
  if (/\.mdx?$/i.test(target)) {
    return anchor
      ? { kind: 'page', slug: slugFromPath(path), anchor }
      : { kind: 'page', slug: slugFromPath(path) };
  }
  return { kind: 'asset', path };
}

/**
 * Joins a relative target onto the linking page's directory.
 *
 * Implemented directly rather than with node:path, because this runs in the
 * browser too and pulling a path polyfill into the renderer to normalise a
 * handful of segments is not worth it. A leading slash means "from the docs
 * root", which is how authors expect an absolute-looking link to behave
 * inside a bundle.
 */
function resolvePath(fromPath: string, target: string): string {
  const base = target.startsWith('/')
    ? []
    : fromPath.split('/').slice(0, -1).filter(Boolean);

  const segments = [...base];
  for (const segment of target.replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      // Popping past the root clamps rather than escaping. The publisher
      // rejects such a link anyway; clamping means the renderer cannot be
      // talked into requesting something outside the bundle.
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}
