import {
  type Asset,
  blobKey,
  MANIFEST_SCHEMA_VERSION,
  type Manifest,
  manifestKey,
  type Page,
  parseManifest,
} from '@brnby/colophon-common';
import { canonicalize } from './canonicalize';
import { sha256 } from './hash';
import { buildNav } from './nav';
import { scan } from './scan';
import type { BundleStorage } from './storage';
import type { AssetDraft, Diagnostic, PageDraft } from './types';
import { hasErrors, validate } from './validate';

export interface PublishOptions {
  docsDir: string;
  bundleId: string;
  source: { url: string; ref: string; commit: string; path?: string };
  publisher?: { name: string; runUrl?: string; toolVersion?: string };
  strict?: boolean;
  /** Timestamp injected so tests and repeat runs are reproducible. */
  now?: () => Date;
}

export interface BuildResult {
  manifest: Manifest;
  diagnostics: Diagnostic[];
  pages: PageDraft[];
  assets: AssetDraft[];
}

export interface UploadStats {
  blobsUploaded: number;
  blobsSkipped: number;
  bytesUploaded: number;
  bytesSkipped: number;
}

/**
 * Scans, validates and assembles a manifest — everything up to but excluding
 * the upload, so `validate` and `publish` share exactly one code path and
 * cannot drift into disagreeing about what is publishable.
 */
export async function build(options: PublishOptions): Promise<BuildResult> {
  const { config, pages, assets } = await scan(options.docsDir);
  const { nav, diagnostics: navDiagnostics } = buildNav(pages, config.nav);
  const diagnostics = [
    ...navDiagnostics,
    ...validate({ pages, assets, nav, strict: options.strict }),
  ];

  const now = options.now?.() ?? new Date();
  const manifestPages: Page[] = pages.map(page => ({
    path: page.path,
    slug: page.slug,
    title: page.title,
    description: page.description,
    type: page.type,
    status: page.status,
    tags: page.tags,
    navOrder: page.navOrder,
    headings: page.headings,
    contentHash: sha256(page.rawBytes),
    size: page.rawBytes.byteLength,
  }));

  const manifestAssets: Asset[] = assets.map(asset => ({
    path: asset.path,
    contentHash: sha256(asset.bytes),
    size: asset.bytes.byteLength,
    mediaType: asset.mediaType,
  }));

  const root = pages.find(page => page.slug === '');

  /**
   * What the revision id is computed from.
   *
   * Deliberately excludes `createdAt` and `publisher`: both describe the RUN,
   * not the documentation. Including them made a re-run of the same commit
   * produce a new revision every time, which is exactly the duplicate history
   * that content-addressing is supposed to prevent. `source.commit` is in
   * here, so identical docs built from different commits still differ.
   */
  const identity = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    bundleId: options.bundleId,
    // Spread first, then default, so an explicit `path: undefined` from a
    // programmatic caller cannot clobber it — canonicalize drops undefined
    // keys, which would silently change the revision id.
    source: {
      type: 'git' as const,
      ...options.source,
      path: options.source.path ?? 'docs',
    },
    title: config.title ?? root?.title ?? options.bundleId,
    description: config.description ?? root?.description,
    pages: manifestPages,
    nav,
    assets: manifestAssets,
  };

  const manifest = parseManifest({
    ...identity,
    createdAt: now.toISOString(),
    publisher: options.publisher,
    revisionId: sha256(Buffer.from(canonicalize(identity), 'utf8')),
  });

  return { manifest, diagnostics, pages, assets };
}

/**
 * Uploads a built bundle, skipping blobs already present.
 *
 * The skip is the whole reason history is affordable: a release branch that
 * differs from main by three pages stores three blobs, and an unchanged page
 * shared by fifty revisions is stored once.
 */
/**
 * Blobs in flight at once during an upload.
 *
 * Every blob costs at least one round trip to check for existence and
 * possibly a second to store it, so publishing a large bundle serially is
 * almost entirely network wait — minutes of CI time for a corpus of a few
 * thousand pages. Bounded rather than a plain Promise.all over everything:
 * an unbounded fan-out would open a connection per page, which risks rate
 * limits on S3 and file descriptor exhaustion on a filesystem backend.
 */
const UPLOAD_CONCURRENCY = 12;

/**
 * Runs `worker` over `items` with at most `limit` in flight.
 *
 * Hand-rolled rather than adding a dependency: the whole implementation is
 * a handful of lines, and the CLI is deliberately thin.
 */
async function forEachConcurrent<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      // Each runner takes the next index rather than a fixed slice, so one
      // slow blob cannot leave the others idle behind it.
      while (next < items.length) {
        const index = next++;
        await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
}

export async function upload(options: {
  manifest: Manifest;
  pages: PageDraft[];
  assets: AssetDraft[];
  storage: BundleStorage;
}): Promise<UploadStats> {
  const { manifest, storage } = options;
  const stats: UploadStats = {
    blobsUploaded: 0,
    blobsSkipped: 0,
    bytesUploaded: 0,
    bytesSkipped: 0,
  };

  // Hashes come from the manifest rather than being recomputed. build()
  // already hashed every byte to produce them, and re-deriving them here
  // would both repeat that pass over the whole bundle and admit the
  // possibility of the two disagreeing — which would upload a blob under a
  // key the manifest does not reference.
  const hashByPath = new Map<string, string>([
    ...manifest.pages.map(page => [page.path, page.contentHash] as const),
    ...manifest.assets.map(asset => [asset.path, asset.contentHash] as const),
  ]);

  const hashFor = (path: string): string => {
    const hash = hashByPath.get(path);
    if (!hash) {
      throw new Error(
        `"${path}" is not in the manifest; upload was given content build() did not see`,
      );
    }
    return hash;
  };

  const blobs: Array<{ hash: string; bytes: Buffer; contentType: string }> = [
    ...options.pages.map(page => ({
      hash: hashFor(page.path),
      bytes: page.rawBytes,
      contentType: 'text/markdown; charset=utf-8',
    })),
    ...options.assets.map(asset => ({
      hash: hashFor(asset.path),
      bytes: asset.bytes,
      contentType: asset.mediaType,
    })),
  ];

  // Identical content within one bundle is one upload, not several.
  const seen = new Set<string>();
  const unique = blobs.filter(blob => {
    if (seen.has(blob.hash)) {
      stats.blobsSkipped += 1;
      stats.bytesSkipped += blob.bytes.byteLength;
      return false;
    }
    seen.add(blob.hash);
    return true;
  });

  await forEachConcurrent(unique, UPLOAD_CONCURRENCY, async blob => {
    const key = blobKey(blob.hash);
    if (await storage.has(key)) {
      stats.blobsSkipped += 1;
      stats.bytesSkipped += blob.bytes.byteLength;
      return;
    }
    await storage.put(key, blob.bytes, blob.contentType);
    stats.blobsUploaded += 1;
    stats.bytesUploaded += blob.bytes.byteLength;
  });

  // The manifest goes last: until it exists the revision is not readable, so
  // a crash mid-upload leaves orphaned blobs rather than a broken revision.
  await storage.put(
    manifestKey(manifest.bundleId, manifest.revisionId),
    Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    'application/json',
  );

  return stats;
}

export { hasErrors };
