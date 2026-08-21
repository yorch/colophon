import { isWithinSubpath } from '@brnby/colophon-common';
import type { Knex } from 'knex';
import { describeEachBackend } from '../__testUtils__/databases';
import {
  createHarness,
  DEFAULT_BUNDLE,
  type Harness,
  longBody,
  revisionId,
} from '../__testUtils__/harness';

/**
 * The subpath predicate exists in SQL as well as in TypeScript, and the SQL
 * copy cannot call the shared function.
 *
 * It is also the copy that matters most: search scoping decides which pages
 * an entity-scoped agent may retrieve. If the SQL admitted more than
 * `isWithinSubpath` does, an agent would receive documentation belonging to a
 * neighbouring component; if it admitted less, it would report pages missing
 * that the docs tab plainly shows.
 *
 * So rather than trusting the two to stay in step, this runs the real query
 * against a real database and asserts the rows it returns are exactly the
 * ones the shared function accepts — the same guard `agreement.test.ts` puts
 * on frontmatter. Editing the SQL to make this pass means editing
 * isWithinSubpath to match, or the other way round.
 */
describeEachBackend('subpath scoping in SQL', backend => {
  let knex: Knex;
  let h: Harness;

  /** Deliberately adversarial: prefixes that overlap, separators inside
   * names, and the empty slug of the landing page. */
  const SLUGS = [
    '',
    'services',
    'services/billing',
    'services/billing/api',
    'services/billing/api/v2',
    'services/billing-v2',
    'services/billingx',
    'services/billing_notes',
    'services/other',
    'other/services/billing',
  ];

  const SUBPATHS = [
    'services/billing',
    'services',
    'services/billing/api',
    'services/billing-v2',
    'nothing/here',
  ];

  beforeEach(async () => {
    knex = await backend.connect();
    h = await createHarness({ knex });
    await h.register({
      revisionId: revisionId('a'),
      channel: 'latest',
      isDefault: true,
      pages: SLUGS.map(slug => ({
        slug,
        title: slug || 'Home',
        // A shared term so one query matches every page, leaving the subpath
        // filter as the only thing under test.
        markdown: `## Section\n\n${longBody('needle')}`,
      })),
    });
  });

  afterEach(async () => {
    await h.cleanup();
    await knex.destroy();
  });

  it.each(SUBPATHS)('agrees with isWithinSubpath for "%s"', async subpath => {
    await h.db.replaceEntityLinks([
      {
        entityRef: 'component:default/scoped',
        bundleId: DEFAULT_BUNDLE,
        subpath,
      },
    ]);

    const { hits } = await h.db.searchChunks({
      query: 'needle',
      entityRefs: ['component:default/scoped'],
      limit: 100,
      offset: 0,
    });

    const fromSql = [...new Set(hits.map(hit => hit.slug))].sort();
    const fromPredicate = SLUGS.filter(slug =>
      isWithinSubpath(slug, subpath),
    ).sort();

    expect(fromSql).toEqual(fromPredicate);
  });

  it('returns every page when the link has no subpath', async () => {
    await h.db.replaceEntityLinks([
      { entityRef: 'component:default/whole', bundleId: DEFAULT_BUNDLE },
    ]);

    const { hits } = await h.db.searchChunks({
      query: 'needle',
      entityRefs: ['component:default/whole'],
      limit: 100,
      offset: 0,
    });

    expect([...new Set(hits.map(hit => hit.slug))].sort()).toEqual(
      [...SLUGS].sort(),
    );
  });

  it('does not let a LIKE metacharacter in a subpath widen the match', async () => {
    // '%' and '_' are wildcards in LIKE. escapeLike must neutralise them, or
    // an entity annotated with one would see the whole bundle.
    await h.db.replaceEntityLinks([
      {
        entityRef: 'component:default/wild',
        bundleId: DEFAULT_BUNDLE,
        subpath: 'services/billing_notes',
      },
    ]);

    const { hits } = await h.db.searchChunks({
      query: 'needle',
      entityRefs: ['component:default/wild'],
      limit: 100,
      offset: 0,
    });

    // The underscore must match literally, not as "any character" — which
    // would also admit services/billing-v2 and services/billingx.
    expect([...new Set(hits.map(hit => hit.slug))]).toEqual([
      'services/billing_notes',
    ]);
  });
});
