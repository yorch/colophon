import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import request from 'supertest';
import { colophonPlugin } from './plugin';

/** Scratch space lives under the repo's tmp/, never the system temp dir. */
const TMP_ROOT = join(__dirname, '../../../tmp');

/**
 * Boots the plugin in a real Backstage backend.
 *
 * Every other test in this package constructs the pieces directly, which
 * verifies the pieces and says nothing about whether the plugin ASSEMBLES.
 * That is a real gap: a plugin can be entirely correct and still fail to
 * start, because a service it asks for is not registered, an extension point
 * is not available, or two things initialise in the wrong order — and none of
 * those are reachable from a unit test that hands the constructor its
 * dependencies by hand.
 *
 * This is the cheapest thing that exercises registration, service resolution,
 * initialisation, and route mounting the way a deployment does.
 */
describe('the plugin in a real backend', () => {
  let storageDir: string;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(TMP_ROOT, 'backend-'));
  });

  afterAll(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  const boot = async () =>
    startTestBackend({
      features: [
        colophonPlugin,
        mockServices.rootConfig.factory({
          data: {
            app: { baseUrl: 'http://localhost:3000' },
            backend: { baseUrl: 'http://localhost:7007' },
            colophon: {
              storage: { type: 'local', local: { directory: storageDir } },
            },
          },
        }),
      ],
    });

  it('starts, resolving every service it asks for', async () => {
    // The assertion is that this resolves at all. A missing service ref or an
    // unavailable extension point fails here and nowhere else.
    const backend = await boot();
    expect(backend.server).toBeDefined();
    await backend.stop();
  });

  it('runs its migrations and serves the bundle list', async () => {
    const backend = await boot();
    try {
      const res = await request(backend.server)
        .get('/api/colophon/bundles')
        .set('authorization', mockCredentials.user.header());

      expect(res.status).toBe(200);
      expect(res.body.bundles).toEqual([]);
    } finally {
      await backend.stop();
    }
  });

  it('mounts every documented route', async () => {
    // A route that is never registered answers 404 with no body, which is
    // indistinguishable from a bundle that does not exist unless you check
    // that the handler ran. Each of these should reach a handler and fail on
    // its own terms.
    const backend = await boot();
    try {
      const bundle = encodeURIComponent('example.com/repo');
      const reach = async (path: string) =>
        (
          await request(backend.server)
            .get(path)
            .set('authorization', mockCredentials.user.header())
        ).status;

      // Each of these must reach a handler and fail on its OWN terms. An
      // unregistered route also answers 404, which is indistinguishable from
      // "no such bundle" unless the other statuses distinguish it.
      expect(await reach(`/api/colophon/bundles/${bundle}/manifest`)).toBe(404);
      expect(await reach(`/api/colophon/bundles/${bundle}/pages`)).toBe(404);
      expect(await reach('/api/colophon/search?q=anything')).toBe(200);
      expect(await reach('/api/colophon/search')).toBe(400);
      expect(await reach('/api/colophon/bundles')).toBe(200);
    } finally {
      await backend.stop();
    }
  });

  it('keeps the corpus projection to service credentials', async () => {
    const backend = await boot();
    try {
      const asUser = await request(backend.server)
        .get('/api/colophon/indexable')
        .set('authorization', mockCredentials.user.header());
      expect(asUser.status).toBe(403);

      const asService = await request(backend.server)
        .get('/api/colophon/indexable')
        .set('authorization', mockCredentials.service.header());
      expect(asService.status).toBe(200);
    } finally {
      await backend.stop();
    }
  });
});
