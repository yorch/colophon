import {
  type BundleId,
  type ContentHash,
  type RevisionId,
  SHA256_PATTERN,
} from './ids';
import { MANIFEST_FILENAME, type Manifest } from './manifest';

/**
 * Object-storage key layout.
 *
 * Two namespaces, with different lifetimes:
 *
 *   blobs/<ab>/<sha256>                              content-addressed, shared
 *   bundles/<bundleId>/revisions/<revisionId>/manifest.json
 *
 * Content-addressing the blobs is what makes retained history affordable. A
 * release branch that differs from `main` by three pages stores three new
 * blobs, not a second full copy of the docs — and an unchanged page shared by
 * fifty revisions is stored exactly once.
 *
 * The two-character fan-out prefix keeps any single key prefix from
 * accumulating the entire corpus, which matters for listing performance and
 * for backends that shard on key prefix.
 */

export const BLOB_PREFIX = 'blobs';
export const BUNDLE_PREFIX = 'bundles';

/** Key for a content-addressed blob — a page body or an asset. */
export function blobKey(hash: ContentHash): string {
  return `${BLOB_PREFIX}/${hash.slice(0, 2)}/${hash}`;
}

/** Key prefix holding every revision of a bundle. */
export function bundleKey(bundleId: BundleId): string {
  return `${BUNDLE_PREFIX}/${bundleId}`;
}

export function revisionKey(
  bundleId: BundleId,
  revisionId: RevisionId,
): string {
  return `${bundleKey(bundleId)}/revisions/${revisionId}`;
}

export function manifestKey(
  bundleId: BundleId,
  revisionId: RevisionId,
): string {
  return `${revisionKey(bundleId, revisionId)}/${MANIFEST_FILENAME}`;
}

/**
 * Recovers the revision a manifest key belongs to, or undefined for any other
 * key.
 *
 * The inverse of {@link manifestKey}, and it lives beside it deliberately:
 * garbage collection reaches a bundle through a bucket listing rather than
 * through the database, so it has nothing but the key to go on. A parser that
 * drifted from the formatter would classify live manifests as unrecognised
 * and, having failed to read them, treat everything they reference as
 * garbage.
 *
 * Split on the LAST `/revisions/` rather than the first: bundle ids are
 * path-like and may themselves contain a segment called `revisions`.
 */
export function parseManifestKey(
  key: string,
): { bundleId: BundleId; revisionId: RevisionId } | undefined {
  const suffix = `/${MANIFEST_FILENAME}`;
  if (!key.startsWith(`${BUNDLE_PREFIX}/`) || !key.endsWith(suffix)) {
    return undefined;
  }
  const body = key.slice(BUNDLE_PREFIX.length + 1, -suffix.length);
  const separator = body.lastIndexOf('/revisions/');
  if (separator < 1) {
    return undefined;
  }
  const bundleId = body.slice(0, separator);
  const revisionId = body.slice(separator + '/revisions/'.length);
  if (!SHA256_PATTERN.test(revisionId)) {
    return undefined;
  }
  return { bundleId, revisionId };
}

/**
 * Every blob key a manifest depends on.
 *
 * The counterpart of what the publisher uploads, and the reason it is stated
 * once here: garbage collection deletes whatever this function does not
 * return. If it ever disagreed with the uploader about which content a
 * revision needs — an asset class it forgot, say — the sweep would delete
 * live pages out from under a published bundle, and nothing would fail until
 * a reader asked for one.
 */
export function referencedBlobKeys(manifest: Manifest): Set<string> {
  return new Set([
    ...manifest.pages.map(page => blobKey(page.contentHash)),
    ...manifest.assets.map(asset => blobKey(asset.contentHash)),
  ]);
}
