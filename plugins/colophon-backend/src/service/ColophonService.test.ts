import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mockServices } from '@backstage/backend-test-utils';
import {
  blobKey,
  DEFAULT_CHUNKING_OPTIONS,
  MANIFEST_SCHEMA_VERSION,
  type Manifest,
  manifestKey,
} from '@brnby/colophon-common';
import knexFactory from 'knex';
import { ColophonDatabase } from '../database';
import type { BundleStorage } from '../storage';
import { LocalBundleStorage } from '../storage/LocalBundleStorage';
import { ColophonService } from './ColophonService';

/** Fixtures live under the repo's tmp/, never the system temp directory. */
const TMP_ROOT = join(__dirname, '../../../../tmp');
const BUNDLE = 'example.com/repo';

const sha = (text: string) =>
  createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

function pageOf(slug: string, title: string, markdown: string) {
  return {
    page: {
      path: `${slug || 'index'}.md`,
      slug,
      title,
      status: 'current' as const,
      tags: [],
      headings: [],
      contentHash: sha(markdown),
      size: Buffer.byteLength(markdown),
    },
    markdown,
  };
}

const LONG = `${'body '.repeat(150).trim()}`;

async function harness() {
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'svc-'));
  // Typed as the interface so the tests exercise the contract every
  // implementation must satisfy, not one class's narrower signature.
  const storage: BundleStorage = new LocalBundleStorage(dir);
  const knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  const db = await ColophonDatabase.create({
    database: mockServices.database.mock({
      getClient: async () => knex,
    }) as never,
  });
  const service = new ColophonService({
    db,
    storage,
    logger: mockServices.logger.mock(),
    chunking: DEFAULT_CHUNKING_OPTIONS,
    retention: { revisionsPerChannel: 2 },
  });

  /** Publishes a revision the way the CLI would: blobs, then a manifest. */
  async function publish(
    revisionId: string,
    pages: Array<{ page: Manifest['pages'][number]; markdown: string }>,
  ) {
    for (const { page, markdown } of pages) {
      await storage.put(
        blobKey(page.contentHash),
        Buffer.from(markdown, 'utf8'),
        'text/markdown',
      );
    }
    const manifest: Manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      bundleId: BUNDLE,
      revisionId,
      createdAt: '2026-08-21T00:00:00.000Z',
      source: { type: 'git', url: 'u', ref: 'main', commit: 'c', path: 'docs' },
      title: 'Repo',
      pages: pages.map(p => p.page),
      nav: pages.map(p => ({ title: p.page.title, slug: p.page.slug })),
      assets: [],
    };
    await storage.put(
      manifestKey(BUNDLE, revisionId),
      Buffer.from(JSON.stringify(manifest), 'utf8'),
      'application/json',
    );
    return manifest;
  }

  return {
    service,
    db,
    publish,
    cleanup: async () => {
      await knex.destroy();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

const REV_A = 'a'.repeat(64);
const REV_B = 'b'.repeat(64);

describe('ingestRevision', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });
  afterEach(() => h.cleanup());

  it('does not chunk a revision no channel points at', async () => {
    // The stated invariant: a PR preview that is published and never pointed
    // at costs index rows, not a re-chunk of the corpus.
    await h.publish(REV_A, [pageOf('', 'Home', `## A\n\n${LONG}`)]);
    const result = await h.service.ingestRevision(BUNDLE, REV_A);
    expect(result.indexed).toBe(false);
    expect(result.chunkCount).toBe(0);
  });

  it('chunks as soon as a channel points at it', async () => {
    // setChannel ingests as part of pointing, so the chunks exist by the time
    // it returns rather than waiting for the next scheduled run.
    const manifest = await h.publish(REV_A, [
      pageOf('', 'Home', `## A\n\n${LONG}`),
    ]);
    await h.db.upsertRevision(manifest);
    const { ingest } = await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });
    expect(ingest.indexed).toBe(true);
    expect(ingest.chunkCount).toBeGreaterThan(0);
  });

  it('reports already-indexed rather than re-chunking on a repeat call', async () => {
    const manifest = await h.publish(REV_A, [
      pageOf('', 'Home', `## A\n\n${LONG}`),
    ]);
    await h.db.upsertRevision(manifest);
    const { ingest } = await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });
    const again = await h.service.ingestRevision(BUNDLE, REV_A);
    expect(again.indexed).toBe(false);
    expect(again.chunkCount).toBe(ingest.chunkCount);
  });

  it('is idempotent, so a repeated run does not duplicate chunks', async () => {
    const manifest = await h.publish(REV_A, [
      pageOf('', 'Home', `## A\n\n${LONG}\n\n## B\n\n${LONG}`),
    ]);
    await h.db.upsertRevision(manifest);
    await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });

    const first = await h.service.ingestRevision(BUNDLE, REV_A);
    const second = await h.service.ingestRevision(BUNDLE, REV_A);
    expect(second.chunkCount).toBe(first.chunkCount);
    expect(await h.db.listChunks(REV_A)).toHaveLength(first.chunkCount);
  });

  it('re-chunks when forced, so a strategy change can be applied', async () => {
    const manifest = await h.publish(REV_A, [
      pageOf('', 'Home', `## A\n\n${LONG}`),
    ]);
    await h.db.upsertRevision(manifest);
    await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });
    await h.service.ingestRevision(BUNDLE, REV_A);
    const forced = await h.service.ingestRevision(BUNDLE, REV_A, {
      force: true,
    });
    expect(forced.indexed).toBe(true);
  });
});

describe('channels', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });
  afterEach(() => h.cleanup());

  it('resolves the default channel when none is named', async () => {
    const manifest = await h.publish(REV_A, [pageOf('', 'Home', LONG)]);
    await h.db.upsertRevision(manifest);
    await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });
    expect((await h.service.resolve(BUNDLE)).revisionId).toBe(REV_A);
  });

  it('repoints a channel without mutating the revision it left', async () => {
    for (const rev of [REV_A, REV_B]) {
      const manifest = await h.publish(rev, [pageOf('', 'Home', LONG)]);
      await h.db.upsertRevision(manifest);
    }
    await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });
    await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_B,
    });

    expect((await h.service.resolve(BUNDLE, 'latest')).revisionId).toBe(REV_B);
    // Rollback is a pointer move, so the old revision must still be there.
    expect(await h.db.getRevision(REV_A)).toBeDefined();
  });

  it('throws for a channel that does not exist', async () => {
    const manifest = await h.publish(REV_A, [pageOf('', 'Home', LONG)]);
    await h.db.upsertRevision(manifest);
    await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });
    await expect(h.service.resolve(BUNDLE, 'nope')).rejects.toThrow();
  });
});

describe('collectGarbage', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });
  afterEach(() => h.cleanup());

  it('never collects a revision a channel points at', async () => {
    const manifest = await h.publish(REV_A, [pageOf('', 'Home', LONG)]);
    await h.db.upsertRevision(manifest);
    await h.service.setChannel({
      bundleId: BUNDLE,
      channel: 'latest',
      revisionId: REV_A,
    });
    expect(await h.service.collectGarbage(BUNDLE)).not.toContain(REV_A);
  });
});
