import type { Knex } from 'knex';
import { describeEachBackend } from '../__testUtils__/databases';
import {
  createHarness,
  DEFAULT_BUNDLE,
  type Harness,
  longBody,
  revisionId,
} from '../__testUtils__/harness';

const REV_A = revisionId('a');
const REV_B = revisionId('b');

describeEachBackend('ColophonService', backend => {
  let knex: Knex;
  let h: Harness;

  beforeEach(async () => {
    knex = await backend.connect();
    h = await createHarness({ knex });
  });

  afterEach(async () => {
    await h.cleanup();
    await knex.destroy();
  });

  const onePage = (label: string) => ({
    pages: [
      {
        slug: '',
        title: 'Home',
        markdown: `## ${label}\n\n${longBody(label)}`,
      },
    ],
  });

  describe('ingestRevision', () => {
    it('does not chunk a revision no channel points at', async () => {
      // A PR preview that is published and never pointed at costs index
      // rows, not a re-chunk of the corpus.
      await h.publish({ revisionId: REV_A, ...onePage('a') });
      const result = await h.colophon.ingestRevision(DEFAULT_BUNDLE, REV_A);
      expect(result.indexed).toBe(false);
      expect(result.chunkCount).toBe(0);
    });

    it('chunks as soon as a channel points at it', async () => {
      // Pointing a channel ingests as part of the same call, so the chunks
      // exist by the time it returns rather than waiting for the schedule.
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        ...onePage('a'),
      });
      expect((await h.db.listChunks(REV_A)).length).toBeGreaterThan(0);
    });

    it('is idempotent, so a repeated run does not duplicate chunks', async () => {
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        pages: [
          {
            slug: '',
            title: 'Home',
            markdown: `## A\n\n${longBody('a')}\n\n## B\n\n${longBody('b')}`,
          },
        ],
      });
      const before = (await h.db.listChunks(REV_A)).length;
      const again = await h.colophon.ingestRevision(DEFAULT_BUNDLE, REV_A);

      expect(again.indexed).toBe(false);
      expect(again.chunkCount).toBe(before);
      expect(await h.db.listChunks(REV_A)).toHaveLength(before);
    });

    it('re-chunks when forced, so a strategy change can be applied', async () => {
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        ...onePage('a'),
      });
      const forced = await h.colophon.ingestRevision(DEFAULT_BUNDLE, REV_A, {
        force: true,
      });
      expect(forced.indexed).toBe(true);
    });
  });

  describe('channels', () => {
    it('resolves the default channel when none is named', async () => {
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        isDefault: true,
        ...onePage('a'),
      });
      expect((await h.colophon.resolve(DEFAULT_BUNDLE)).revisionId).toBe(REV_A);
    });

    it('repoints a channel without mutating the revision it left', async () => {
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        isDefault: true,
        ...onePage('a'),
      });
      await h.register({
        revisionId: REV_B,
        channel: 'latest',
        isDefault: true,
        ...onePage('b'),
      });

      expect(
        (await h.colophon.resolve(DEFAULT_BUNDLE, 'latest')).revisionId,
      ).toBe(REV_B);
      // Rollback is a pointer move, so the old revision must still be there.
      expect(await h.db.getRevision(REV_A)).toBeDefined();
    });

    it('throws for a channel that does not exist', async () => {
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        ...onePage('a'),
      });
      await expect(
        h.colophon.resolve(DEFAULT_BUNDLE, 'nope'),
      ).rejects.toThrow();
    });
  });

  describe('pages', () => {
    it('serves the landing page markdown as published', async () => {
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        ...onePage('a'),
      });
      const { markdown } = await h.colophon.getPage(DEFAULT_BUNDLE, '');
      expect(markdown).toContain('## a');
    });

    it('reports a page that does not exist', async () => {
      await h.register({
        revisionId: REV_A,
        channel: 'latest',
        ...onePage('a'),
      });
      await expect(
        h.colophon.getPage(DEFAULT_BUNDLE, 'missing'),
      ).rejects.toThrow();
    });
  });
});
