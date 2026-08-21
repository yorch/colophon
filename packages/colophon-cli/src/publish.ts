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

  const blobs: Array<{ hash: string; bytes: Buffer; contentType: string }> = [
    ...options.pages.map(page => ({
      hash: sha256(page.rawBytes),
      bytes: page.rawBytes,
      contentType: 'text/markdown; charset=utf-8',
    })),
    ...options.assets.map(asset => ({
      hash: sha256(asset.bytes),
      bytes: asset.bytes,
      contentType: asset.mediaType,
    })),
  ];

  // Identical content within one bundle is one upload, not several.
  const seen = new Set<string>();
  for (const blob of blobs) {
    if (seen.has(blob.hash)) {
      stats.blobsSkipped += 1;
      stats.bytesSkipped += blob.bytes.byteLength;
      continue;
    }
    seen.add(blob.hash);

    const key = blobKey(blob.hash);
    if (await storage.has(key)) {
      stats.blobsSkipped += 1;
      stats.bytesSkipped += blob.bytes.byteLength;
      continue;
    }
    await storage.put(key, blob.bytes, blob.contentType);
    stats.blobsUploaded += 1;
    stats.bytesUploaded += blob.bytes.byteLength;
  }

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
