import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mockServices } from '@backstage/backend-test-utils';
import {
  blobKey,
  type ChunkingOptions,
  DEFAULT_CHUNKING_OPTIONS,
  MANIFEST_SCHEMA_VERSION,
  type Manifest,
  manifestKey,
  type NavNode,
  type Page,
} from '@brnby/colophon-common';
import type { Knex } from 'knex';
import { ColophonDatabase } from '../database';
import { ColophonService } from '../service/ColophonService';
import type { BundleStorage } from '../storage';
import { LocalBundleStorage } from '../storage/LocalBundleStorage';

/** Scratch space lives under the repo's tmp/, never the system temp dir. */
const TMP_ROOT = join(__dirname, '../../../../tmp');

export const sha256 = (input: string) =>
  createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');

/** Comfortably over the default 200-char `minChars`, so a test about some
 * other rule is never quietly testing the merge rule instead. */
export const longBody = (label = 'body') => `${label} `.repeat(60).trim();

export interface PageSpec {
  slug: string;
  title: string;
  markdown: string;
  description?: string;
  type?: Page['type'];
  status?: Page['status'];
  tags?: string[];
}

export interface PublishSpec {
  bundleId?: string;
  revisionId: string;
  title?: string;
  description?: string;
  createdAt?: string;
  pages: PageSpec[];
  nav?: NavNode[];
  assets?: Array<{ path: string; body: string; mediaType: string }>;
}

export interface Harness {
  db: ColophonDatabase;
  storage: BundleStorage;
  colophon: ColophonService;
  bundleId: string;
  /** Writes blobs and a manifest the way the publisher CLI would. */
  publish(spec: PublishSpec): Promise<Manifest>;
  /** Publishes and points a channel at the result, as CI does. */
  register(
    spec: PublishSpec & { channel?: string; isDefault?: boolean },
  ): Promise<Manifest>;
  cleanup(): Promise<void>;
}

export const DEFAULT_BUNDLE = 'example.com/repo';

/**
 * A service wired to a migrated database and a real filesystem-backed store.
 *
 * Real storage rather than a stub, because the ingest path's cost and its
 * failure mode both come from blob reads — a Map would hide both.
 */
export async function createHarness(options: {
  knex: Knex;
  chunking?: ChunkingOptions;
  revisionsPerChannel?: number;
  bundleId?: string;
}): Promise<Harness> {
  const bundleId = options.bundleId ?? DEFAULT_BUNDLE;
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'colophon-'));
  // Typed as the interface so tests exercise the contract every
  // implementation must satisfy, not one class's narrower signature.
  const storage: BundleStorage = new LocalBundleStorage(dir);
  const db = await ColophonDatabase.create({
    database: mockServices.database({ knex: options.knex }),
  });
  const colophon = new ColophonService({
    db,
    storage,
    logger: mockServices.logger.mock(),
    chunking: options.chunking ?? DEFAULT_CHUNKING_OPTIONS,
    retention: { revisionsPerChannel: options.revisionsPerChannel ?? 10 },
  });

  async function publish(spec: PublishSpec): Promise<Manifest> {
    const id = spec.bundleId ?? bundleId;
    const pages: Page[] = spec.pages.map(page => ({
      path: `${page.slug || 'index'}.md`,
      slug: page.slug,
      title: page.title,
      description: page.description,
      type: page.type,
      status: page.status ?? 'current',
      tags: page.tags ?? [],
      headings: [],
      contentHash: sha256(page.markdown),
      size: Buffer.byteLength(page.markdown),
    }));
    const assets = (spec.assets ?? []).map(asset => ({
      path: asset.path,
      contentHash: sha256(asset.body),
      size: Buffer.byteLength(asset.body),
      mediaType: asset.mediaType,
    }));

    for (const page of spec.pages) {
      await storage.put(
        blobKey(sha256(page.markdown)),
        Buffer.from(page.markdown, 'utf8'),
        'text/markdown',
      );
    }
    for (const asset of spec.assets ?? []) {
      await storage.put(
        blobKey(sha256(asset.body)),
        Buffer.from(asset.body, 'utf8'),
        asset.mediaType,
      );
    }

    const manifest: Manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      bundleId: id,
      revisionId: spec.revisionId,
      createdAt: spec.createdAt ?? '2026-08-21T00:00:00.000Z',
      source: {
        type: 'git',
        url: `https://${id}`,
        ref: 'main',
        commit: 'c'.repeat(40),
        path: 'docs',
      },
      title: spec.title ?? 'Repo',
      description: spec.description,
      pages,
      nav:
        spec.nav ?? pages.map(page => ({ title: page.title, slug: page.slug })),
      assets,
    };
    await storage.put(
      manifestKey(id, spec.revisionId),
      Buffer.from(JSON.stringify(manifest), 'utf8'),
      'application/json',
    );
    return manifest;
  }

  async function register(
    spec: PublishSpec & { channel?: string; isDefault?: boolean },
  ): Promise<Manifest> {
    const manifest = await publish(spec);
    await colophon.registerRevision({
      bundleId: spec.bundleId ?? bundleId,
      revisionId: spec.revisionId,
      channel: spec.channel,
      isDefault: spec.isDefault,
    });
    return manifest;
  }

  return {
    db,
    storage,
    colophon,
    bundleId,
    publish,
    register,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** A 64-hex revision id derived from a short label, for readable tests. */
export function revisionId(label: string): string {
  return sha256(label);
}
