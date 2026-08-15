import type { BundleId, ContentHash, RevisionId } from './ids';
import { MANIFEST_FILENAME } from './manifest';

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
