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

/**
 * Retiring channels and bundles.
 *
 * The rules under test are the ones whose violation is silent. A channel
 * deletion that took its revision with it would break a SECOND channel
 * pointing at the same revision, and nothing would report it until someone
 * opened that channel's docs. A bundle deletion that left chunks behind would
 * keep serving search results for a repository that no longer exists.
 */
const REV = revisionId('deletion-a');
const OTHER_REV = revisionId('deletion-b');

const STATUS_BY_ERROR: Record<string, number> = {
  InputError: 400,
  NotFoundError: 404,
  NotAllowedError: 403,
  AuthenticationError: 401,
  ConflictError: 409,
};

describeEachBackend('deletion', backend => {
  let knex: Knex;
  let h: Harness;
  let app: express.Express;

  const buildApp = async (harness: Harness) => {
    const built = express().use(
      await createRouter({
        colophon: harness.colophon,
        httpAuth: mockServices.httpAuth(),
        authorizer: harness.authorizer,
        logger: mockServices.logger.mock(),
        appBaseUrl: 'http://localhost:3000',
      }),
    );
    built.use(
      (
        error: Error,
        _req: express.Request,
        res: express.Response,
        _next: unknown,
      ) => {
        res
          .status(STATUS_BY_ERROR[error.name] ?? 500)
          .json({ error: { name: error.name, message: error.message } });
      },
    );
    return built;
  };

  const page = (label: string) => [
    { slug: '', title: 'Home', markdown: `## H\n\n${longBody(label)}` },
  ];

  beforeEach(async () => {
    knex = await backend.connect();
    h = await createHarness({ knex });
    await h.register({
      revisionId: REV,
      channel: 'latest',
      isDefault: true,
      pages: page('home'),
    });
    app = await buildApp(h);
  });

  afterEach(async () => {
    await h.cleanup();
    await knex.destroy();
  });

  const bundlePath = (suffix = '', id = DEFAULT_BUNDLE) =>
    `/bundles/${encodeURIComponent(id)}${suffix}`;

  describe('a channel', () => {
    beforeEach(async () => {
      await h.register({
        revisionId: OTHER_REV,
        channel: 'pr-42',
        pages: page('preview'),
      });
    });

    it('is removed, and stops resolving', async () => {
      const res = await request(app).delete(bundlePath('/channels/pr-42'));
      expect(res.status).toBe(200);
      expect(res.body.channel).toBe('pr-42');
      await expect(
        h.colophon.resolve(DEFAULT_BUNDLE, 'pr-42'),
      ).rejects.toThrow();
      // The rest of the bundle is untouched.
      expect((await h.colophon.resolve(DEFAULT_BUNDLE)).channel).toBe('latest');
    });

    it('refuses the default channel, which nothing would resolve without', async () => {
      const res = await request(app).delete(bundlePath('/channels/latest'));
      expect(res.status).toBe(409);
      expect((await h.colophon.resolve(DEFAULT_BUNDLE)).channel).toBe('latest');
    });

    it('does not orphan a revision a second channel still points at', async () => {
      // Two channels, one revision — the shape a release cut produces when
      // `1.x` is branched off whatever `latest` currently points at.
      await h.colophon.setChannel({
        bundleId: DEFAULT_BUNDLE,
        channel: '1.x',
        revisionId: OTHER_REV,
      });

      expect(
        (await request(app).delete(bundlePath('/channels/pr-42'))).status,
      ).toBe(200);

      expect(await h.db.getRevision(OTHER_REV)).toBeDefined();
      expect((await h.colophon.resolve(DEFAULT_BUNDLE, '1.x')).revisionId).toBe(
        OTHER_REV,
      );
    });

    it('404s for a channel that does not exist', async () => {
      expect(
        (await request(app).delete(bundlePath('/channels/never-existed')))
          .status,
      ).toBe(404);
    });

    it('404s for a bundle that does not exist', async () => {
      const res = await request(app).delete(
        `${bundlePath('/channels/latest', 'nope.com/missing')}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('a bundle', () => {
    it('takes its channels, revisions, pages and chunks with it', async () => {
      await h.register({
        revisionId: OTHER_REV,
        channel: 'pr-42',
        pages: page('preview'),
      });

      const res = await request(app).delete(bundlePath());
      expect(res.status).toBe(200);
      expect(res.body.channelsDeleted).toBe(2);
      expect(res.body.revisionsDeleted).toBe(2);

      expect(await h.db.listChannels(DEFAULT_BUNDLE)).toEqual([]);
      expect(await h.db.listRevisions(DEFAULT_BUNDLE)).toEqual([]);
      expect(await h.db.listPages(REV)).toEqual([]);
      expect(await h.db.listChunks(REV)).toEqual([]);
      // The docs home lists bundles through their channels, so this is what
      // makes a decommissioned repository actually disappear from it.
      expect(await h.db.listBundles()).toEqual([]);
    });

    it('404s the second time, rather than reporting a delete it did not do', async () => {
      expect((await request(app).delete(bundlePath())).status).toBe(200);
      // Idempotent-204 was the alternative. A bundle id is a repository name
      // typed by hand, and answering a typo with success is how an operator
      // comes to believe they retired something they did not.
      expect((await request(app).delete(bundlePath())).status).toBe(404);
    });

    it('400s for a malformed bundle id', async () => {
      expect(
        (await request(app).delete('/bundles/NOT%20VALID%2FUPPER')).status,
      ).toBe(400);
    });
  });

  describe('without the publish permission', () => {
    it('refuses both deletions and changes nothing', async () => {
      const deniedKnex = await backend.connect();
      const denied = await createHarness({
        knex: deniedKnex,
        denyPublish: true,
      });
      await denied.register({
        revisionId: REV,
        channel: 'latest',
        isDefault: true,
        pages: page('home'),
      });
      const deniedApp = await buildApp(denied);
      try {
        expect(
          (await request(deniedApp).delete(bundlePath('/channels/latest')))
            .status,
        ).toBe(403);
        expect((await request(deniedApp).delete(bundlePath())).status).toBe(
          403,
        );
        expect(await denied.db.listChannels(DEFAULT_BUNDLE)).toHaveLength(1);
        expect(await denied.db.listRevisions(DEFAULT_BUNDLE)).toHaveLength(1);
      } finally {
        await denied.cleanup();
        await deniedKnex.destroy();
      }
    });
  });

  describe('the retained-revision projection', () => {
    it('reports every revision, including ones no channel points at', async () => {
      // Retention deliberately keeps a window of unpointed revisions so a
      // rollback has something to roll back to. A collector that could not
      // see them would delete exactly the blobs they exist to preserve.
      const unpointed = await h.publish({
        revisionId: OTHER_REV,
        pages: page('rollback'),
      });
      await h.db.upsertRevision(unpointed);

      const res = await request(app)
        .get('/revisions')
        .set('authorization', mockCredentials.service.header());
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(
        res.body.revisions.map((r: { revisionId: string }) => r.revisionId),
      ).toEqual(expect.arrayContaining([REV, OTHER_REV]));
    });

    it('refuses a caller without the publish permission', async () => {
      const deniedKnex = await backend.connect();
      const denied = await createHarness({
        knex: deniedKnex,
        denyPublish: true,
      });
      const deniedApp = await buildApp(denied);
      try {
        expect((await request(deniedApp).get('/revisions')).status).toBe(403);
      } finally {
        await denied.cleanup();
        await deniedKnex.destroy();
      }
    });
  });
});
