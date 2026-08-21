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
 * Retention is the one place that deletes anything, so it is the one place
 * where a race loses data or aborts a publish.
 */
describeEachBackend('retention', backend => {
  let knex: Knex;
  let h: Harness;

  beforeEach(async () => {
    knex = await backend.connect();
    h = await createHarness({ knex, revisionsPerChannel: 0 });
  });

  afterEach(async () => {
    await h.cleanup();
    await knex.destroy();
  });

  const publish = (label: string, createdAt: string) =>
    h.publish({
      revisionId: revisionId(label),
      createdAt,
      pages: [
        { slug: '', title: 'Home', markdown: `## H\n\n${longBody(label)}` },
      ],
    });

  it('never collects a revision a channel points at', async () => {
    const pinned = await publish('a', '2026-01-01T00:00:00.000Z');
    await h.db.upsertRevision(pinned);
    await h.colophon.setChannel({
      bundleId: DEFAULT_BUNDLE,
      channel: 'pinned',
      revisionId: pinned.revisionId,
    });

    expect(await h.colophon.collectGarbage(DEFAULT_BUNDLE)).not.toContain(
      pinned.revisionId,
    );
    expect(await h.db.getRevision(pinned.revisionId)).toBeDefined();
  });

  it('collects a revision nothing points at', async () => {
    const orphan = await publish('b', '2026-01-02T00:00:00.000Z');
    await h.db.upsertRevision(orphan);

    expect(await h.colophon.collectGarbage(DEFAULT_BUNDLE)).toContain(
      orphan.revisionId,
    );
    expect(await h.db.getRevision(orphan.revisionId)).toBeUndefined();
  });

  it('stays consistent when a claim and a collection race', async () => {
    // The original bug: selection and deletion ran in separate transactions,
    // so a setChannel landing between them made the delete violate the
    // foreign key from colophon_channels — throwing out of collectGarbage,
    // out of setChannel, and turning an already-successful publish into a
    // 500. Selection and deletion now share one transaction.
    //
    // Either ordering is legitimate: GC may collect a revision nothing yet
    // points at, in which case a later claim correctly reports it missing.
    // What must never happen is a foreign key violation, or a revision that
    // a channel points at being deleted.
    const claimed = await publish('c', '2026-01-03T00:00:00.000Z');
    await h.db.upsertRevision(claimed);

    const [collected, claim] = await Promise.allSettled([
      h.colophon.collectGarbage(DEFAULT_BUNDLE),
      h.colophon.setChannel({
        bundleId: DEFAULT_BUNDLE,
        channel: 'pinned',
        revisionId: claimed.revisionId,
      }),
    ]);

    // Retention itself must never fail — that is what aborted the publish.
    expect(collected.status).toBe('fulfilled');

    if (claim.status === 'fulfilled') {
      // The claim won: the revision must survive and still resolve.
      expect(await h.db.getRevision(claimed.revisionId)).toBeDefined();
      expect(
        (await h.colophon.resolve(DEFAULT_BUNDLE, 'pinned')).revisionId,
      ).toBe(claimed.revisionId);
    } else {
      // GC won: the revision is gone and no channel dangles at it.
      expect(await h.db.getRevision(claimed.revisionId)).toBeUndefined();
      await expect(
        h.colophon.resolve(DEFAULT_BUNDLE, 'pinned'),
      ).rejects.toThrow();
    }
  });

  it('leaves a publish successful even when retention cannot run', async () => {
    // Housekeeping failing must not report a failed publish for work that
    // landed. Simulated by making the retention query throw.
    const revision = await publish('d', '2026-01-04T00:00:00.000Z');
    await h.db.upsertRevision(revision);

    const original = h.db.collectUnreferencedRevisions.bind(h.db);
    h.db.collectUnreferencedRevisions = async () => {
      throw new Error('database unavailable');
    };
    try {
      await expect(
        h.colophon.setChannel({
          bundleId: DEFAULT_BUNDLE,
          channel: 'latest',
          revisionId: revision.revisionId,
          isDefault: true,
        }),
      ).resolves.toBeDefined();
    } finally {
      h.db.collectUnreferencedRevisions = original;
    }

    expect((await h.colophon.resolve(DEFAULT_BUNDLE)).revisionId).toBe(
      revision.revisionId,
    );
  });
});
