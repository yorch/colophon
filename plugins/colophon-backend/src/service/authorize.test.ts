import { mockCredentials } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';
import { describeEachBackend } from '../__testUtils__/databases';
import {
  createHarness,
  DEFAULT_BUNDLE,
  type Harness,
  longBody,
  revisionId,
} from '../__testUtils__/harness';
import { registerColophonActions } from '../actions';

const REV = revisionId('a');
const ENTITY = 'component:default/payments-api';
const OTHER_BUNDLE = 'example.com/other';

/**
 * Documentation reads were authenticated and never authorised. Every route
 * and every MCP action called `httpAuth.credentials` and discarded the
 * result, and the search collator set an `authorization.resourceRef` that did
 * nothing because it declared no `visibilityPermission` — so the one signal
 * suggesting filtering existed was inert.
 *
 * These tests pin the three things that must now hold: the permission is
 * consulted, catalog visibility is delegated to, and an unlinked bundle stays
 * readable so publishing before the catalog entry lands does not look broken.
 */
describeEachBackend('authorization', backend => {
  let knex: Knex;

  const credentials = mockCredentials.user();

  async function seed(h: Harness) {
    await h.register({
      revisionId: REV,
      channel: 'latest',
      isDefault: true,
      pages: [
        { slug: '', title: 'Home', markdown: `## H\n\n${longBody('secret')}` },
      ],
    });
    await h.db.replaceEntityLinks([
      { entityRef: ENTITY, bundleId: DEFAULT_BUNDLE },
    ]);
  }

  afterEach(async () => {
    await knex?.destroy();
  });

  it('allows a caller who can see the linked entity', async () => {
    knex = await backend.connect();
    const h = await createHarness({ knex, visibleEntityRefs: [ENTITY] });
    await seed(h);

    await expect(
      h.authorizer.assertCanRead(DEFAULT_BUNDLE, credentials),
    ).resolves.toBeUndefined();
    await h.cleanup();
  });

  it('refuses a caller who cannot see the linked entity', async () => {
    knex = await backend.connect();
    const h = await createHarness({ knex, visibleEntityRefs: [] });
    await seed(h);

    // Delegation is the point: documentation is as visible as the component
    // it documents, without a second policy to keep in step.
    await expect(
      h.authorizer.assertCanRead(DEFAULT_BUNDLE, credentials),
    ).rejects.toThrow();
    await h.cleanup();
  });

  it('reports a hidden bundle as unknown rather than forbidden', async () => {
    knex = await backend.connect();
    const h = await createHarness({ knex, visibleEntityRefs: [] });
    await seed(h);

    // Saying "forbidden" would confirm the bundle exists, and a bundle id is
    // a repository name.
    await expect(
      h.authorizer.assertCanRead(DEFAULT_BUNDLE, credentials),
    ).rejects.toThrow(/Unknown bundle/);
    await h.cleanup();
  });

  it('refuses everything when the read permission is denied', async () => {
    knex = await backend.connect();
    const h = await createHarness({
      knex,
      visibleEntityRefs: [ENTITY],
      denyRead: true,
    });
    await seed(h);

    await expect(
      h.authorizer.assertCanRead(DEFAULT_BUNDLE, credentials),
    ).rejects.toThrow();
    await h.cleanup();
  });

  it('allows a bundle no entity references', async () => {
    // Nothing to delegate to. Denying would make the plugin look broken
    // whenever docs are published before the catalog entry lands.
    knex = await backend.connect();
    const h = await createHarness({ knex, visibleEntityRefs: [] });
    await h.register({
      bundleId: OTHER_BUNDLE,
      revisionId: REV,
      channel: 'latest',
      pages: [
        { slug: '', title: 'Home', markdown: `## H\n\n${longBody('open')}` },
      ],
    });

    await expect(
      h.authorizer.assertCanRead(OTHER_BUNDLE, credentials),
    ).resolves.toBeUndefined();
    await h.cleanup();
  });

  describe('filterReadable', () => {
    it('omits bundles the caller cannot see rather than failing', async () => {
      knex = await backend.connect();
      const h = await createHarness({ knex, visibleEntityRefs: [] });
      await seed(h);

      const readable = await h.authorizer.filterReadable(
        [DEFAULT_BUNDLE, OTHER_BUNDLE],
        credentials,
      );
      expect(readable.has(DEFAULT_BUNDLE)).toBe(false);
      // Unlinked, so still readable.
      expect(readable.has(OTHER_BUNDLE)).toBe(true);
      await h.cleanup();
    });

    it('returns nothing when the read permission is denied', async () => {
      knex = await backend.connect();
      const h = await createHarness({ knex, denyRead: true });
      await seed(h);

      expect(
        (await h.authorizer.filterReadable([DEFAULT_BUNDLE], credentials)).size,
      ).toBe(0);
      await h.cleanup();
    });
  });

  describe('MCP actions', () => {
    it('refuse a page the caller may not read', async () => {
      // Actions run as the calling user, so an agent must not reach
      // documentation its operator cannot.
      knex = await backend.connect();
      const h = await createHarness({ knex, visibleEntityRefs: [] });
      await seed(h);

      const registered = new Map<string, { action: Function }>();
      registerColophonActions({
        actionsRegistry: {
          register: (d: { name: string; action: Function }) =>
            registered.set(d.name, d),
        } as never,
        colophon: h.colophon,
        authorizer: h.authorizer,
        appBaseUrl: 'http://localhost:3000',
      });

      await expect(
        registered.get('get-page')?.action({
          input: { bundleId: DEFAULT_BUNDLE, slug: '' },
          credentials,
        }),
      ).rejects.toThrow();
      await h.cleanup();
    });
  });
});
