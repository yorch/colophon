import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { NotFoundError } from '@backstage/errors';
import {
  blobKey,
  MANIFEST_SCHEMA_VERSION,
  manifestKey,
} from '@brnby/colophon-common';
import request from 'supertest';
import { colophonPlugin } from './plugin';
import type { BundleStorage } from './storage';
import { colophonStorageExtensionPoint } from './storage';

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

/**
 * The adopter path for `colophonStorageExtensionPoint`, end to end.
 *
 * The built-ins register through the same `addFactory` call, so a test that
 * only exercised `local` would exercise the seam too — but not the ORDERING,
 * which cannot be checked anywhere else. A factory added from a module has to
 * be visible when the plugin builds its store, and that rests on the backend
 * initialising every module of a plugin before the plugin itself. Nothing in
 * a unit test observes that; only a real backend with a real module does.
 *
 * So this publishes and reads a page through a store that exists nowhere in
 * the plugin, which is the only evidence that an adopter's could work too.
 */
describe('a storage factory contributed by a module', () => {
  const BUNDLE = 'example.com/repo';
  const REVISION = 'a'.repeat(64);
  const MARKDOWN = '# Served from the adopter store';

  /**
   * Deliberately not filesystem-backed. If the plugin ignored the module and
   * fell through to the built-in `local` store, every assertion below would
   * fail rather than quietly pass against a directory.
   */
  const memoryStore = () => {
    const objects = new Map<string, Buffer>();
    const storage: BundleStorage = {
      has: async key => objects.has(key),
      get: async key => {
        const body = objects.get(key);
        if (!body) {
          throw new NotFoundError(`No object at storage key "${key}"`);
        }
        return body;
      },
      put: async (key, body) => {
        objects.set(key, body);
      },
    };
    return { objects, storage };
  };

  /** Writes the blobs and manifest the publisher CLI would have uploaded. */
  const seed = (objects: Map<string, Buffer>) => {
    const contentHash = createHash('sha256')
      .update(Buffer.from(MARKDOWN, 'utf8'))
      .digest('hex');
    objects.set(blobKey(contentHash), Buffer.from(MARKDOWN, 'utf8'));
    objects.set(
      manifestKey(BUNDLE, REVISION),
      Buffer.from(
        JSON.stringify({
          schemaVersion: MANIFEST_SCHEMA_VERSION,
          bundleId: BUNDLE,
          revisionId: REVISION,
          createdAt: '2026-08-21T00:00:00.000Z',
          source: {
            type: 'git',
            url: `https://${BUNDLE}`,
            ref: 'main',
            commit: 'c'.repeat(40),
            path: 'docs',
          },
          title: 'Repo',
          pages: [
            {
              path: 'index.md',
              slug: '',
              title: 'Index',
              status: 'current',
              tags: [],
              headings: [],
              contentHash,
              size: Buffer.byteLength(MARKDOWN),
            },
          ],
          nav: [{ title: 'Index', slug: '' }],
          assets: [],
        }),
        'utf8',
      ),
    );
  };

  it('is what the plugin reads through when config selects it', async () => {
    const { objects, storage } = memoryStore();
    seed(objects);

    const backend = await startTestBackend({
      features: [
        colophonPlugin,
        createBackendModule({
          pluginId: 'colophon',
          moduleId: 'memory-storage',
          register(env) {
            env.registerInit({
              deps: { colophonStorage: colophonStorageExtensionPoint },
              async init({ colophonStorage }) {
                colophonStorage.addFactory('memory', ({ config }) => {
                  // The factory gets its OWN slice of config, not the whole
                  // storage section.
                  expect(config?.getString('label')).toBe('adopter');
                  return storage;
                });
              },
            });
          },
        }),
        mockServices.rootConfig.factory({
          data: {
            app: { baseUrl: 'http://localhost:3000' },
            backend: { baseUrl: 'http://localhost:7007' },
            colophon: {
              storage: { type: 'memory', memory: { label: 'adopter' } },
            },
          },
        }),
      ],
    });

    try {
      const registered = await request(backend.server)
        .post(`/api/colophon/bundles/${encodeURIComponent(BUNDLE)}/revisions`)
        .set('authorization', mockCredentials.user.header())
        .send({ revisionId: REVISION, channel: 'latest', isDefault: true });
      expect(registered.status).toBe(201);

      const page = await request(backend.server)
        .get(`/api/colophon/bundles/${encodeURIComponent(BUNDLE)}/pages`)
        .set('authorization', mockCredentials.user.header());
      expect(page.status).toBe(200);
      expect(page.text).toBe(MARKDOWN);
    } finally {
      await backend.stop();
    }
  });
});
