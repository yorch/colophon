import {
  BLOB_PREFIX,
  BUNDLE_PREFIX,
  parseManifest,
  parseManifestKey,
  type RetainedRevision,
  referencedBlobKeys,
} from '@brnby/colophon-common';
import { forEachConcurrent } from './publish';
import type { BundleStorage, StoredObject } from './storage';

/**
 * Sweeping objects no retained revision references any more.
 *
 * The one thing that makes this dangerous rather than routine: blobs are
 * content-addressed into a SINGLE flat namespace — `blobs/<ab>/<sha256>` —
 * shared by every bundle in the deployment. Two repositories with the same
 * LICENSE file have one object between them. So reachability cannot be
 * computed per bundle: a sweep that decided "nothing in this bundle needs it"
 * would delete the other repository's live content, and nothing would fail
 * until a reader asked for that page.
 *
 * Reachability is therefore global. Every retained revision of every bundle
 * contributes to one referenced set, and only what survives that union is
 * even a candidate.
 *
 * ## What is retained is the backend's answer, not the bucket's
 *
 * A manifest sitting in storage proves only that something was published
 * once. Whether it is still retained is a database question — retention keeps
 * a window of revisions no channel points at, so a rollback has something to
 * roll back to, and those revisions' blobs must survive. Reading the bucket
 * alone would either keep everything forever or delete exactly what retention
 * exists to preserve.
 *
 * ## The ordering, and the window it does not close
 *
 * Blobs are listed FIRST, before the retained set is fetched. Anything
 * uploaded after that listing is invisible to this run and therefore safe,
 * which removes the obvious race with a concurrent publish. `minAgeMs` closes
 * most of the rest: a publish uploads its blobs and its manifest and only
 * then registers the revision, so for that window the manifest is real and
 * unretained, and deleting it would break the publish that is still in
 * flight.
 *
 * What remains: a publish that re-uses an OLD blob it did not have to upload,
 * for a revision registered after the retained set was read. The blob is old,
 * so age does not protect it, and it is referenced by nothing retained. It is
 * a narrow window and closing it properly needs a marker protocol rather than
 * a sweep — until then, run this when publishing is quiet.
 */

export interface GcPlan {
  /** Distinct bundles among the retained revisions. */
  bundles: number;
  revisions: number;
  reachableBlobs: number;
  /** Blobs no retained manifest references. */
  unreferencedBlobs: StoredObject[];
  /** Manifests of revisions the backend no longer retains. */
  staleManifests: StoredObject[];
  /** Objects that would have been collected but are younger than minAge. */
  skippedRecent: number;
  bytes: number;
}

/** Manifests read at once while walking reachability. */
const READ_CONCURRENCY = 12;

/**
 * How long an object is left alone regardless of reachability.
 *
 * A day rather than an hour, because the thing being outlived is a CI
 * pipeline: the gap between "blobs uploaded" and "revision registered" is
 * seconds when everything works and can be much longer when a publish is
 * retried around a backend outage.
 */
export const DEFAULT_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export async function planGc(options: {
  storage: BundleStorage;
  /** Called after the blob listing, deliberately; see the module comment. */
  retained: () => Promise<RetainedRevision[]>;
  minAgeMs?: number;
  now?: Date;
}): Promise<GcPlan> {
  const { storage } = options;
  const minAgeMs = options.minAgeMs ?? DEFAULT_MIN_AGE_MS;
  const cutoff = (options.now?.getTime() ?? Date.now()) - minAgeMs;

  const candidates = await storage.list(`${BLOB_PREFIX}/`);
  const retained = await options.retained();
  const retainedKeys = new Set(
    retained.map(revision => `${revision.bundleId}\n${revision.revisionId}`),
  );

  const manifests = await storage.list(`${BUNDLE_PREFIX}/`);
  const reachable = new Set<string>();
  const staleManifests: StoredObject[] = [];

  const readable = manifests.filter(object => {
    const parsed = parseManifestKey(object.key);
    if (!parsed) {
      // Not a manifest — anything else under `bundles/` was put there by
      // something that is not this tool, and is not ours to delete.
      return false;
    }
    if (retainedKeys.has(`${parsed.bundleId}\n${parsed.revisionId}`)) {
      return true;
    }
    staleManifests.push(object);
    return false;
  });

  await forEachConcurrent(readable, READ_CONCURRENCY, async object => {
    const manifest = parseManifest(
      JSON.parse((await storage.get(object.key)).toString('utf8')),
    );
    for (const key of referencedBlobKeys(manifest)) {
      reachable.add(key);
    }
  });

  let skippedRecent = 0;
  const tooYoung = (object: StoredObject) => {
    // An object of unknown age is treated as young. Being wrong in that
    // direction costs a sweep; being wrong the other way costs content.
    const modified = object.lastModified?.getTime() ?? Infinity;
    if (modified > cutoff) {
      skippedRecent += 1;
      return true;
    }
    return false;
  };

  const unreferencedBlobs = candidates.filter(
    object => !reachable.has(object.key) && !tooYoung(object),
  );
  const collectableManifests = staleManifests.filter(
    object => !tooYoung(object),
  );

  return {
    bundles: new Set(retained.map(revision => revision.bundleId)).size,
    revisions: retained.length,
    reachableBlobs: reachable.size,
    unreferencedBlobs,
    staleManifests: collectableManifests,
    skippedRecent,
    bytes: [...unreferencedBlobs, ...collectableManifests].reduce(
      (total, object) => total + object.size,
      0,
    ),
  };
}

/**
 * Performs the sweep a plan describes.
 *
 * Manifests go before blobs, matching the pointers-before-targets order the
 * backend uses for channels and revisions. It is the order whose interrupted
 * state is harmless: a crash halfway leaves blobs nothing points at, which
 * the next run collects, rather than a manifest pointing at content that is
 * already gone — a revision that reads as corrupt rather than as absent.
 */
export async function executeGc(options: {
  storage: BundleStorage;
  plan: GcPlan;
}): Promise<void> {
  const { storage, plan } = options;
  await forEachConcurrent(plan.staleManifests, READ_CONCURRENCY, object =>
    storage.delete(object.key),
  );
  await forEachConcurrent(plan.unreferencedBlobs, READ_CONCURRENCY, object =>
    storage.delete(object.key),
  );
}
