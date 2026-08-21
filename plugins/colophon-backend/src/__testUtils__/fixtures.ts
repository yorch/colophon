import { createHash } from 'node:crypto';
import { mockServices } from '@backstage/backend-test-utils';
import { NotFoundError } from '@backstage/errors';
import {
  blobKey,
  DEFAULT_CHUNKING_OPTIONS,
  type Manifest,
  manifestKey,
  type NavNode,
  type Page,
  parseManifest,
  slugFromPath,
} from '@brnby/colophon-common';
import type { Knex } from 'knex';
import { ColophonDatabase } from '../database';
import { ColophonService } from '../service/ColophonService';
import type { BundleStorage } from '../storage';

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * In-memory {@link BundleStorage}.
 *
 * The real object store is exercised by the storage tests; everything above it
 * only cares that a key either yields bytes or throws `NotFoundError`, and a
 * Map says that in one line.
 */
export class MemoryBundleStorage implements BundleStorage {
  readonly objects = new Map<string, Buffer>();
  /** Keys read since the last {@link resetReads}, for asserting on re-chunks. */
  readonly reads: string[] = [];

  async has(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async get(key: string): Promise<Buffer> {
    this.reads.push(key);
    const body = this.objects.get(key);
    if (!body) {
      throw new NotFoundError(`No object at storage key "${key}"`);
    }
    return body;
  }

  async put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body);
  }

  resetReads(): void {
    this.reads.length = 0;
  }
}

export interface PageSpec {
  /** Path within the docs root; the slug is derived from it. */
  path: string;
  title: string;
  markdown: string;
  description?: string;
  type?: Page['type'];
  status?: Page['status'];
  tags?: string[];
}

export interface BundleSpec {
  bundleId: string;
  title?: string;
  description?: string;
  createdAt?: string;
  commit?: string;
  pages: PageSpec[];
  nav?: NavNode[];
  assets?: Array<{ path: string; body: string; mediaType: string }>;
}

/**
 * Writes a publishable revision into `storage` and returns its manifest.
 *
 * The revision id is derived from the manifest body exactly as the CLI does,
 * so two identical spec inputs produce the same revision — which is what lets
 * the idempotency tests re-publish without inventing a second identity.
 */
export function publishBundle(
  storage: BundleStorage,
  spec: BundleSpec,
): Manifest {
  const pages: Page[] = spec.pages.map(page => {
    const body = Buffer.from(page.markdown, 'utf8');
    return {
      path: page.path,
      slug: slugFromPath(page.path),
      title: page.title,
      description: page.description,
      type: page.type,
      status: page.status ?? 'current',
      tags: page.tags ?? [],
      headings: [],
      contentHash: sha256(body),
      size: body.length,
    };
  });

  const assets = (spec.assets ?? []).map(asset => {
    const body = Buffer.from(asset.body, 'utf8');
    return {
      path: asset.path,
      contentHash: sha256(body),
      size: body.length,
      mediaType: asset.mediaType,
    };
  });

  const body = {
    schemaVersion: 1 as const,
    bundleId: spec.bundleId,
    createdAt: spec.createdAt ?? '2026-01-01T00:00:00.000Z',
    source: {
      type: 'git' as const,
      url: `https://${spec.bundleId}`,
      ref: 'main',
      commit: spec.commit ?? 'a'.repeat(40),
      path: 'docs',
    },
    title: spec.title ?? spec.bundleId,
    description: spec.description,
    pages,
    nav:
      spec.nav ?? pages.map(page => ({ title: page.title, slug: page.slug })),
    assets,
  };
  const manifest = parseManifest({
    ...body,
    revisionId: sha256(JSON.stringify(body)),
  });

  // Written through the same keys the backend reads, so a missing blob in a
  // test is a genuinely missing blob and not a key-layout disagreement.
  void storage.put(
    manifestKey(manifest.bundleId, manifest.revisionId),
    Buffer.from(JSON.stringify(manifest), 'utf8'),
    'application/json',
  );
  spec.pages.forEach((page, index) => {
    void storage.put(
      blobKey(pages[index].contentHash),
      Buffer.from(page.markdown, 'utf8'),
      'text/markdown',
    );
  });
  (spec.assets ?? []).forEach((asset, index) => {
    void storage.put(
      blobKey(assets[index].contentHash),
      Buffer.from(asset.body, 'utf8'),
      asset.mediaType,
    );
  });

  return manifest;
}

export interface TestHarness {
  db: ColophonDatabase;
  storage: MemoryBundleStorage;
  colophon: ColophonService;
}

/** A service wired to a real (migrated) database and an in-memory store. */
export async function createTestHarness(options: {
  knex: Knex;
  revisionsPerChannel?: number;
  chunking?: ColophonService extends never
    ? never
    : Parameters<typeof ColophonService.prototype.ingestRevision> extends never
      ? never
      : typeof DEFAULT_CHUNKING_OPTIONS;
}): Promise<TestHarness> {
  const db = await ColophonDatabase.create({
    database: mockServices.database({ knex: options.knex }),
  });
  const storage = new MemoryBundleStorage();
  const colophon = new ColophonService({
    db,
    storage,
    logger: mockServices.logger.mock(),
    chunking: options.chunking ?? DEFAULT_CHUNKING_OPTIONS,
    retention: { revisionsPerChannel: options.revisionsPerChannel ?? 10 },
  });
  return { db, storage, colophon };
}
