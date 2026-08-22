import { z } from 'zod';

/**
 * A bundle is the unit of publication: one `docs/` tree, published as a whole.
 *
 * Bundle ids deliberately allow `/` so they can be used verbatim as an
 * object-storage key prefix — `bundles/github.com/brnby/payments-api/...` is
 * far easier to debug in a bucket browser than an opaque hash. The charset is
 * restricted to what is safe in an S3 key, a URL path, and a filesystem path.
 *
 * Lowercase is enforced rather than merely recommended. TechDocs carries a
 * `legacyPathCasing` compatibility flag to this day because it allowed
 * case-sensitive keys and then met case-insensitive storage; there is no
 * reason to re-learn that lesson.
 */
export const BUNDLE_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

/** Channel names are short mutable labels: `latest`, `1.x`, `next`, `pr-42`. */
export const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** Lowercase hex sha-256, as produced by `sha256(bytes).toString('hex')`. */
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const bundleIdSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    BUNDLE_ID_PATTERN,
    'must be lowercase path-like segments, e.g. "github.com/org/repo"',
  )
  .refine(v => !v.includes('..'), 'must not contain ".."');

export const channelSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(CHANNEL_PATTERN, 'must be lowercase alphanumeric with . _ -');

/**
 * Revision ids are the sha-256 of the canonicalised manifest body. This makes
 * publishing idempotent: re-running CI on the same commit produces byte-identical
 * content and therefore the same revision, so a retried pipeline does not
 * accumulate duplicate history. Two builds of the same docs from different
 * commits still differ, because the commit sha is part of the manifest.
 */
export const revisionIdSchema = z
  .string()
  .regex(SHA256_PATTERN, 'must be a lowercase hex sha-256');

export const contentHashSchema = z
  .string()
  .regex(SHA256_PATTERN, 'must be a lowercase hex sha-256');

export type BundleId = z.infer<typeof bundleIdSchema>;
export type ChannelName = z.infer<typeof channelSchema>;
export type RevisionId = z.infer<typeof revisionIdSchema>;
export type ContentHash = z.infer<typeof contentHashSchema>;

/** The channel a bare, unqualified docs URL resolves to. */
export const DEFAULT_CHANNEL = 'latest';

/**
 * The catalog annotation that links an entity to a bundle.
 *
 * Value is `<bundleId>` or `<bundleId>#<subpath>`. The subpath form is what
 * makes one shared `docs/` tree serve many components in a monorepo: each
 * entity points at the same bundle but scopes its docs tab to a subtree.
 */
export const COLOPHON_ANNOTATION = 'brnby.io/colophon';

/**
 * The Backstage Search document type for a documentation chunk.
 *
 * Lives here rather than in the backend that emits it, because the frontend
 * has to name the same string to register a result renderer and a result-type
 * filter for it. Two independent copies of a value that must match is the
 * shape of a bug that shows up as "search works, but the results are
 * unstyled and unfilterable" — with nothing failing anywhere.
 */
export const COLOPHON_DOCUMENT_TYPE = 'colophon';

export interface BundleRef {
  bundleId: BundleId;
  /** Slug prefix this entity is scoped to, or undefined for the whole bundle. */
  subpath?: string;
}

/** Parses the `brnby.io/colophon` annotation value. Throws on malformed input. */
export function parseBundleRef(annotation: string): BundleRef {
  const [rawId, ...rest] = annotation.split('#');
  if (rest.length > 1) {
    throw new Error(
      `Invalid Colophon annotation "${annotation}": more than one "#"`,
    );
  }
  const bundleId = bundleIdSchema.parse(rawId.trim());
  const subpath = rest[0]?.trim();
  return subpath ? { bundleId, subpath: normalizeSlug(subpath) } : { bundleId };
}

export function formatBundleRef(ref: BundleRef): string {
  return ref.subpath ? `${ref.bundleId}#${ref.subpath}` : ref.bundleId;
}

/**
 * Normalises a slug: lowercase, no leading/trailing slash, no duplicate
 * slashes. Slugs are the URL-facing identity of a page and are compared
 * verbatim, so every producer must agree on this function.
 */
export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().split('/').filter(Boolean).join('/');
}

/**
 * Derives a page's slug from its path within the docs directory.
 *
 * `index.md` collapses to its containing directory, so `guides/index.md` and
 * `guides.md` both address `guides` — the docs-root `index.md` becomes `''`,
 * the bundle landing page.
 */
export function slugFromPath(path: string): string {
  const withoutExtension = path.replace(/\.mdx?$/i, '');
  const segments = normalizeSlug(withoutExtension).split('/').filter(Boolean);
  if (segments[segments.length - 1] === 'index') {
    segments.pop();
  }
  return segments.join('/');
}

/**
 * Whether a page is inside the subtree an entity is scoped to.
 *
 * This is contract, not a local predicate. The frontend uses it to decide
 * what an entity's docs tab shows and the backend uses it to decide what the
 * MCP actions return; if the two disagreed, a tab would list pages an agent
 * could not retrieve, or an agent would cite pages the tab never shows.
 *
 * Matching on a segment boundary is what keeps `services/billing` from also
 * claiming `services/billing-v2`.
 */
export function isWithinSubpath(slug: string, subpath?: string): boolean {
  if (!subpath) {
    return true;
  }
  return slug === subpath || slug.startsWith(`${subpath}/`);
}

/**
 * The slug of a bundle's landing page.
 *
 * A named constant because the value is the EMPTY STRING, and an empty
 * string is falsy. Every `slug || fallback` and `slug ? a : b` written
 * against it silently treats "the landing page" as "no page", and that
 * mistake has now been made three separate times in this codebase: the
 * landing page was dropped from derived navigation, it was omitted from a
 * URL as though absent, and opening a bundle resolved to whichever page
 * sorted first instead of to the index.
 *
 * Naming it does not make the string truthy. What it does is give the
 * concept somewhere to live, so the next person writing this comparison has
 * `isEntrySlug` to reach for instead of inventing a fourth version.
 */
export const ENTRY_SLUG = '';

/**
 * The slug that opens a bundle, or a scoped subtree of one.
 *
 * An entity scoped to `services/billing` opens at that page; an unscoped
 * bundle opens at its root index. Callers should ask for this rather than
 * falling back to whichever page happens to sort first, which is what the
 * portal did before the concept existed.
 */
export function entrySlug(subpath?: string): string {
  return subpath ?? ENTRY_SLUG;
}

/** Whether a slug addresses a bundle's landing page. */
export function isEntrySlug(slug: string): boolean {
  return slug === ENTRY_SLUG;
}
