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
import express from 'express';
import knexFactory from 'knex';
import request from 'supertest';
import { ColophonDatabase } from '../database';
import type { BundleStorage } from '../storage';
import { LocalBundleStorage } from '../storage/LocalBundleStorage';
import { ColophonService } from './ColophonService';
import { createRouter } from './router';

const TMP_ROOT = join(__dirname, '../../../../tmp');
const BUNDLE = 'example.com/repo';
const REV = 'a'.repeat(64);
const LONG = 'body '.repeat(150).trim();

/** The subset of Backstage's error-to-status mapping this router can produce. */
const STATUS_BY_ERROR: Record<string, number> = {
  InputError: 400,
  NotFoundError: 404,
  NotAllowedError: 403,
  AuthenticationError: 401,
  ConflictError: 409,
};

const sha = (text: string) =>
  createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

async function harness() {
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'router-'));
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
  const colophon = new ColophonService({
    db,
    storage,
    logger: mockServices.logger.mock(),
    chunking: DEFAULT_CHUNKING_OPTIONS,
    retention: { revisionsPerChannel: 5 },
  });

  const pages = [
    { slug: '', title: 'Home', markdown: `# Home\n\n${LONG}` },
    { slug: 'guides/deploy', title: 'Deploy', markdown: `## Steps\n\n${LONG}` },
  ];
  for (const page of pages) {
    await storage.put(
      blobKey(sha(page.markdown)),
      Buffer.from(page.markdown),
      'text/markdown',
    );
  }
  const manifest: Manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    bundleId: BUNDLE,
    revisionId: REV,
    createdAt: '2026-08-21T00:00:00.000Z',
    source: { type: 'git', url: 'u', ref: 'main', commit: 'c', path: 'docs' },
    title: 'Repo',
    pages: pages.map(p => ({
      path: `${p.slug || 'index'}.md`,
      slug: p.slug,
      title: p.title,
      status: 'current' as const,
      tags: [],
      headings: [],
      contentHash: sha(p.markdown),
      size: Buffer.byteLength(p.markdown),
    })),
    nav: pages.map(p => ({ title: p.title, slug: p.slug })),
    assets: [],
  };
  await storage.put(
    manifestKey(BUNDLE, REV),
    Buffer.from(JSON.stringify(manifest)),
    'application/json',
  );
  // Registers exactly the way the CLI does, so the harness exercises the
  // real publication path rather than a shortcut through the database.
  await colophon.registerRevision({
    bundleId: BUNDLE,
    revisionId: REV,
    channel: 'latest',
    isDefault: true,
  });

  const app = express().use(
    await createRouter({
      colophon,
      httpAuth: mockServices.httpAuth(),
      logger: mockServices.logger.mock(),
      appBaseUrl: 'http://localhost:3000',
    }),
  );
  // Stands in for Backstage's own error middleware, which the real backend
  // mounts around every plugin router but a bare express app does not.
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: unknown,
    ) => {
      res.status(STATUS_BY_ERROR[error.name] ?? 500).json({
        error: { name: error.name, message: error.message },
      });
    },
  );

  return {
    app,
    cleanup: async () => {
      await knex.destroy();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe('router', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });
  afterEach(() => h.cleanup());

  it('lists bundles', async () => {
    const res = await request(h.app).get('/bundles');
    expect(res.status).toBe(200);
    expect(res.body.bundles[0].bundleId).toBe(BUNDLE);
  });

  it('returns the manifest with the resolved channel', async () => {
    const res = await request(h.app).get(
      `/bundles/${encodeURIComponent(BUNDLE)}/manifest`,
    );
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('latest');
    expect(res.body.manifest.pages).toHaveLength(2);
  });

  it('serves the landing page from the slug-less route', async () => {
    // The bundle landing page has the empty slug, so both route shapes must
    // reach the same handler.
    const res = await request(h.app).get(
      `/bundles/${encodeURIComponent(BUNDLE)}/pages`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('# Home');
    expect(res.headers['content-type']).toContain('text/markdown');
  });

  it('serves a nested page through the wildcard route', async () => {
    const res = await request(h.app).get(
      `/bundles/${encodeURIComponent(BUNDLE)}/pages/guides/deploy`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('## Steps');
  });

  it('reports the revision and channel in headers, for cache busting', async () => {
    const res = await request(h.app).get(
      `/bundles/${encodeURIComponent(BUNDLE)}/pages`,
    );
    expect(res.headers['x-colophon-revision']).toBe(REV);
    expect(res.headers['x-colophon-channel']).toBe('latest');
  });

  it('lists channels', async () => {
    const res = await request(h.app).get(
      `/bundles/${encodeURIComponent(BUNDLE)}/channels`,
    );
    expect(res.status).toBe(200);
    expect(res.body.channels).toHaveLength(1);
  });

  it('searches chunks', async () => {
    const res = await request(h.app).get('/search').query({ q: 'body' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('rejects a search with no query', async () => {
    expect((await request(h.app).get('/search')).status).toBe(400);
  });

  it('rejects a search limit above the maximum', async () => {
    const res = await request(h.app)
      .get('/search')
      .query({ q: 'a', limit: 5000 });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown bundle', async () => {
    const res = await request(h.app).get(
      '/bundles/nope.com%2Fmissing/manifest',
    );
    expect(res.status).toBe(404);
  });

  it('404s for a page that does not exist', async () => {
    const res = await request(h.app).get(
      `/bundles/${encodeURIComponent(BUNDLE)}/pages/not/a/page`,
    );
    expect(res.status).toBe(404);
  });

  it('400s for a malformed bundle id', async () => {
    const res = await request(h.app).get(
      '/bundles/NOT%20VALID%2FUPPER/manifest',
    );
    expect(res.status).toBe(400);
  });

  it('400s when registering a revision with a malformed body', async () => {
    const res = await request(h.app)
      .post(`/bundles/${encodeURIComponent(BUNDLE)}/revisions`)
      .send({ revisionId: 'not-a-sha' });
    expect(res.status).toBe(400);
  });
});
