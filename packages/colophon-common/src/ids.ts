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
