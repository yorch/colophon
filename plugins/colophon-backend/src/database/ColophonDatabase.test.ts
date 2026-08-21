import type { Knex } from 'knex';
import { describeEachBackend } from '../__testUtils__/databases';
import {
  createHarness,
  DEFAULT_BUNDLE,
  type Harness,
  longBody,
  revisionId,
} from '../__testUtils__/harness';

const REV = revisionId('a');

/**
 * The search layer takes genuinely different code paths per backend —
 * tsvector/ts_rank on Postgres, LIKE scoring on SQLite — so the same
 * expectations are asserted against both. Locally only SQLite runs; CI
 * supplies a Postgres connection string and both do.
 */
describeEachBackend('ColophonDatabase', backend => {
  let knex: Knex;
  let h: Harness;

  beforeEach(async () => {
    knex = await backend.connect();
    h = await createHarness({ knex });
    await h.register({
      revisionId: REV,
      channel: 'latest',
      isDefault: true,
      title: 'Payments API',
      pages: [
        {
          slug: '',
          title: 'Payments API',
          description: 'The payments service.',
          markdown: `# Payments API\n\n${longBody('overview')}`,
        },
        {
          slug: 'guides/rotate',
          title: 'Rotating credentials',
          description: 'How to rotate database credentials.',
          type: 'how-to',
          tags: ['security', 'database'],
          markdown: `## Rotating credentials\n\n${longBody('rotate')}\n\n## Verifying\n\n${longBody('verify')}`,
        },
        {
          slug: 'reference/limits',
          title: 'Rate limits',
          type: 'reference',
          tags: ['limits'],
          markdown: `## Rate limits\n\n${longBody('throttle')}`,
        },
      ],
    });
  });

  afterEach(async () => {
    await h.cleanup();
    await knex.destroy();
  });

  const search = (query: string, over: Record<string, unknown> = {}) =>
    h.db.searchChunks({ query, limit: 20, offset: 0, ...over });

  describe('matching', () => {
    it('finds a chunk by a word in its body', async () => {
      const { hits, total } = await search('rotate');
      expect(total).toBeGreaterThan(0);
      expect(hits.some(hit => hit.slug === 'guides/rotate')).toBe(true);
    });

    it('finds a chunk by a word in its heading trail', async () => {
      const { hits } = await search('credentials');
      expect(hits.some(hit => hit.slug === 'guides/rotate')).toBe(true);
    });

    it('returns nothing for a term that appears nowhere', async () => {
      expect(await search('zzzzabsent')).toEqual({ hits: [], total: 0 });
    });

    it('returns nothing rather than throwing for a punctuation-only query', async () => {
      // Reaches the term-filter guard; must not reach the backend as
      // malformed SQL or an empty tsquery.
      expect((await search('!!! ???')).total).toBe(0);
    });

    it('survives a query containing full-text operators', async () => {
      // & | : ! ( ) are tsquery syntax. plainto_tsquery must neutralise them
      // rather than raising a syntax error.
      for (const query of ['rotate & verify', 'a | b', "it's", 'x:y', '(a)']) {
        await expect(search(query)).resolves.toBeDefined();
      }
    });

    it('is case-insensitive', async () => {
      const lower = await search('rotate');
      const upper = await search('ROTATE');
      expect(upper.total).toBe(lower.total);
    });
  });

  describe('filters', () => {
    it('restricts by document type', async () => {
      const { hits } = await search('rotate', { type: 'reference' });
      expect(hits.every(hit => hit.slug === 'reference/limits')).toBe(true);
    });

    it('requires ALL listed tags, because tags filter rather than query', async () => {
      const both = await search('rotate', { tags: ['security', 'database'] });
      expect(both.hits.every(hit => hit.slug === 'guides/rotate')).toBe(true);

      const impossible = await search('rotate', {
        tags: ['security', 'nonexistent'],
      });
      expect(impossible.total).toBe(0);
    });

    it('restricts by bundle', async () => {
      expect(
        (await search('rotate', { bundleIds: [DEFAULT_BUNDLE] })).total,
      ).toBeGreaterThan(0);
      expect(
        (await search('rotate', { bundleIds: ['other.com/nope'] })).total,
      ).toBe(0);
    });
  });

  describe('pagination', () => {
    it('reports a total independent of the page size', async () => {
      const full = await search('rotate');
      const page = await search('rotate', { limit: 1 });
      expect(page.hits).toHaveLength(1);
      expect(page.total).toBe(full.total);
    });

    it('advances with offset without repeating a hit', async () => {
      const first = await search('rotate', { limit: 1, offset: 0 });
      const second = await search('rotate', { limit: 1, offset: 1 });
      if (first.total > 1) {
        expect(second.hits[0]?.id).not.toBe(first.hits[0]?.id);
      }
    });

    it('returns an empty page past the end rather than failing', async () => {
      expect((await search('rotate', { limit: 5, offset: 9999 })).hits).toEqual(
        [],
      );
    });
  });

  describe('ranking', () => {
    it('orders by descending score', async () => {
      const { hits } = await search('rotate credentials');
      const scores = hits.map(hit => hit.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    });

    it('scores a heading-trail match above a body-only match', async () => {
      // Both backends weight the breadcrumb higher: Postgres via setweight
      // 'A', SQLite via the LIKE scoring multiplier.
      const { hits } = await search('credentials');
      expect(hits[0]?.slug).toBe('guides/rotate');
    });
  });

  describe('channel scoping', () => {
    it('only returns chunks from channel-pointed revisions', async () => {
      const orphan = revisionId('b');
      await h.publish({
        revisionId: orphan,
        pages: [
          {
            slug: 'ghost',
            title: 'Ghost',
            markdown: `## Ghost\n\n${longBody('spectral')}`,
          },
        ],
      });
      await h.colophon.ingestRevision(DEFAULT_BUNDLE, orphan);
      expect((await search('spectral')).total).toBe(0);
    });
  });
});
