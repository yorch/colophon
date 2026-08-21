import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { describeEachBackend } from '../__testUtils__/databases';
import {
  createHarness,
  DEFAULT_BUNDLE,
  type Harness,
  longBody,
  revisionId,
} from '../__testUtils__/harness';
import { createRouter } from './router';

const REV = revisionId('a');

/** The subset of Backstage's error-to-status mapping this router produces.
 * A bare express app has none of the middleware the real backend mounts. */
const STATUS_BY_ERROR: Record<string, number> = {
  InputError: 400,
  NotFoundError: 404,
  NotAllowedError: 403,
  AuthenticationError: 401,
  ConflictError: 409,
};

describeEachBackend('router', backend => {
  let knex: Knex;
  let h: Harness;
  let app: express.Express;

  beforeEach(async () => {
    knex = await backend.connect();
    h = await createHarness({ knex });
    await h.register({
      revisionId: REV,
      channel: 'latest',
      isDefault: true,
      title: 'Repo',
      pages: [
        { slug: '', title: 'Home', markdown: `# Home\n\n${longBody('home')}` },
        {
          slug: 'guides/deploy',
          title: 'Deploy',
          markdown: `## Steps\n\n${longBody('deploy')}`,
        },
      ],
    });

    app = express().use(
      await createRouter({
        colophon: h.colophon,
        httpAuth: mockServices.httpAuth(),
        authorizer: h.authorizer,
        logger: mockServices.logger.mock(),
        appBaseUrl: 'http://localhost:3000',
      }),
    );
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
  });

  afterEach(async () => {
    await h.cleanup();
    await knex.destroy();
  });

  const bundlePath = (suffix = '') =>
    `/bundles/${encodeURIComponent(DEFAULT_BUNDLE)}${suffix}`;

  it('lists bundles', async () => {
    const res = await request(app).get('/bundles');
    expect(res.status).toBe(200);
    expect(res.body.bundles[0].bundleId).toBe(DEFAULT_BUNDLE);
  });

  it('returns the manifest with the resolved channel', async () => {
    const res = await request(app).get(bundlePath('/manifest'));
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('latest');
    expect(res.body.manifest.pages).toHaveLength(2);
  });

  it('serves the landing page from the slug-less route', async () => {
    // The landing page has the empty slug, so both route shapes must reach
    // the same handler.
    const res = await request(app).get(bundlePath('/pages'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('# Home');
    expect(res.headers['content-type']).toContain('text/markdown');
  });

  it('serves a nested page through the wildcard route', async () => {
    const res = await request(app).get(bundlePath('/pages/guides/deploy'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('## Steps');
  });

  it('reports the revision and channel in headers, for cache busting', async () => {
    const res = await request(app).get(bundlePath('/pages'));
    expect(res.headers['x-colophon-revision']).toBe(REV);
    expect(res.headers['x-colophon-channel']).toBe('latest');
  });

  it('lists channels', async () => {
    const res = await request(app).get(bundlePath('/channels'));
    expect(res.status).toBe(200);
    expect(res.body.channels).toHaveLength(1);
  });

  it('searches chunks', async () => {
    const res = await request(app).get('/search').query({ q: 'deploy' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it.each([
    ['no query', '/search', {}],
    ['limit above the maximum', '/search', { q: 'a', limit: 5000 }],
  ])('400s for %s', async (_name, path, query) => {
    expect((await request(app).get(path).query(query)).status).toBe(400);
  });

  it('400s for a malformed bundle id', async () => {
    expect(
      (await request(app).get('/bundles/NOT%20VALID%2FUPPER/manifest')).status,
    ).toBe(400);
  });

  it('404s for an unknown bundle', async () => {
    expect(
      (await request(app).get('/bundles/nope.com%2Fmissing/manifest')).status,
    ).toBe(404);
  });

  it('404s for a page that does not exist', async () => {
    expect(
      (await request(app).get(bundlePath('/pages/not/a/page'))).status,
    ).toBe(404);
  });

  describe('a caller who may not see the linked entity', () => {
    /** Same corpus, but the catalog hides the entity the bundle links to. */
    async function restricted() {
      const restrictedKnex = await backend.connect();
      const h = await createHarness({
        knex: restrictedKnex,
        visibleEntityRefs: [],
      });
      await h.register({
        revisionId: REV,
        channel: 'latest',
        isDefault: true,
        pages: [
          { slug: '', title: 'Home', markdown: `# Home\n\n${longBody('h')}` },
          {
            slug: 'guides/deploy',
            title: 'Deploy',
            markdown: `## S\n\n${longBody('d')}`,
          },
        ],
      });
      await h.db.replaceEntityLinks([
        { entityRef: 'component:default/hidden', bundleId: DEFAULT_BUNDLE },
      ]);

      const restrictedApp = express().use(
        await createRouter({
          colophon: h.colophon,
          httpAuth: mockServices.httpAuth(),
          authorizer: h.authorizer,
          logger: mockServices.logger.mock(),
          appBaseUrl: 'http://localhost:3000',
        }),
      );
      restrictedApp.use(
        (
          error: Error,
          _req: express.Request,
          res: express.Response,
          _next: unknown,
        ) => {
          res.status(STATUS_BY_ERROR[error.name] ?? 500).json({
            error: { name: error.name },
          });
        },
      );
      return {
        app: restrictedApp,
        cleanup: async () => {
          await h.cleanup();
          await restrictedKnex.destroy();
        },
      };
    }

    it.each([
      ['landing page', '/pages'],
      ['nested page', '/pages/guides/deploy'],
      ['manifest', '/manifest'],
      ['channels', '/channels'],
    ])('reports the %s as not found', async (_name, suffix) => {
      // NotFound rather than Forbidden: saying "forbidden" would confirm the
      // bundle exists, and a bundle id is a repository name.
      const r = await restricted();
      try {
        expect((await request(r.app).get(bundlePath(suffix))).status).toBe(404);
      } finally {
        await r.cleanup();
      }
    });

    it('omits it from the bundle list rather than failing', async () => {
      const r = await restricted();
      try {
        const res = await request(r.app).get('/bundles');
        expect(res.status).toBe(200);
        expect(res.body.bundles).toEqual([]);
      } finally {
        await r.cleanup();
      }
    });

    it('omits its chunks from search', async () => {
      const r = await restricted();
      try {
        const res = await request(r.app).get('/search').query({ q: 'deploy' });
        expect(res.status).toBe(200);
        expect(res.body.results).toEqual([]);
        expect(res.body.total).toBe(0);
      } finally {
        await r.cleanup();
      }
    });
  });

  describe('the indexable projection', () => {
    it('refuses a user token', async () => {
      // It pages the ENTIRE corpus across every bundle, bypassing the
      // per-bundle authorization the other routes apply, so only the search
      // collator's service identity may reach it.
      const res = await request(app)
        .get('/indexable')
        .set('authorization', mockCredentials.user.header());
      expect(res.status).toBe(403);
    });

    it('refuses an unauthenticated caller', async () => {
      expect((await request(app).get('/indexable')).status).toBe(403);
    });

    it('serves a service token', async () => {
      const res = await request(app)
        .get('/indexable')
        .set('authorization', mockCredentials.service.header());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rows)).toBe(true);
    });
  });

  it('400s when registering a revision with a malformed body', async () => {
    const res = await request(app)
      .post(bundlePath('/revisions'))
      .send({ revisionId: 'not-a-sha' });
    expect(res.status).toBe(400);
  });
});
