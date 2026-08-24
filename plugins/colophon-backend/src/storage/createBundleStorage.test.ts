import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mockServices } from '@backstage/backend-test-utils';
import { NotFoundError } from '@backstage/errors';
import { createBundleStorageRegistry } from './createBundleStorage';
import { LocalBundleStorage } from './LocalBundleStorage';
import type { BundleStorage } from './types';

/** Fixtures live under the repo's tmp/, never the system temp directory. */
const TMP_ROOT = join(__dirname, '../../../../tmp');

const logger = mockServices.logger.mock();

const configFor = (storage: object) =>
  mockServices.rootConfig({ data: { colophon: { storage } } });

/**
 * These keys are a contract with `app-config.yaml`, and an unread config key
 * is not an error — it is silently dropped. That is how
 * `storage.local.directory` came to be documented in three places while the
 * code read `storage.local.root`: publishes succeeded, every read afterwards
 * 404'd, and no test noticed, because none of them asserted WHERE the storage
 * pointed. Constructing the object proves nothing; only reading a byte back
 * through it does.
 */
describe('the built-in storage factories', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(TMP_ROOT, 'storage-'));
    await writeFile(join(dir, 'probe'), 'hello');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const build = (local: object) =>
    createBundleStorageRegistry().create({
      config: configFor({ type: 'local', local }),
      logger,
    });

  it('reads the documented storage.local.directory key', async () => {
    const storage = await build({ directory: dir });
    expect(storage).toBeInstanceOf(LocalBundleStorage);
    // Reaches a file that only exists under the configured directory, so this
    // fails if the key was ignored and the default root was used instead.
    expect((await storage.get('probe')).toString()).toBe('hello');
  });

  it('ignores a key it does not define, rather than guessing', async () => {
    // `root` was the name the code used to read. Nothing should answer to it
    // now, and the failure has to be visible rather than a silent fallback to
    // a directory that happens to be empty.
    const storage = await build({ root: dir });
    await expect(storage.get('probe')).rejects.toThrow(/probe/);
  });

  it('defaults to local when nothing is configured at all', async () => {
    // An app-config with no colophon.storage section is the shape every
    // existing deployment that never set one has, and it has to keep meaning
    // "local" now that the type is resolved through a registry.
    const storage = await createBundleStorageRegistry().create({
      config: mockServices.rootConfig({ data: {} }),
      logger,
    });
    expect(storage).toBeInstanceOf(LocalBundleStorage);
  });

  it('requires a bucket for s3', async () => {
    await expect(
      createBundleStorageRegistry().create({
        config: configFor({ type: 's3' }),
        logger,
      }),
    ).rejects.toThrow(/bucket is required/);
  });
});

/**
 * The registry is the seam every store now goes through, adopters' and ours
 * alike. What is worth asserting is not that it holds a map, but that each
 * way of misusing it fails at startup with something that names the problem —
 * an extension point whose failure mode is a 404 on the first read would be
 * worse than the hardcoded branch it replaced.
 */
describe('the storage registry', () => {
  const stub: BundleStorage = {
    has: async () => true,
    get: async () => Buffer.from('from the adopter store'),
    put: async () => {},
  };

  it('builds a store from a factory a module registered', async () => {
    const registry = createBundleStorageRegistry();
    registry.addFactory('azure', ({ config }) => {
      // The factory's own slice of config, not the whole storage section —
      // an adopter reads `container`, never `azure.container`.
      expect(config?.getString('container')).toBe('docs');
      return stub;
    });

    const storage = await registry.create({
      config: configFor({ type: 'azure', azure: { container: 'docs' } }),
      logger,
    });
    expect((await storage.get('anything')).toString()).toBe(
      'from the adopter store',
    );
  });

  it('hands a factory no config when its section is absent', async () => {
    const registry = createBundleStorageRegistry();
    registry.addFactory('memory', ({ config }) => {
      expect(config).toBeUndefined();
      return stub;
    });

    await expect(
      registry.create({ config: configFor({ type: 'memory' }), logger }),
    ).resolves.toBe(stub);
  });

  it('names every registered type when the selected one is unknown', async () => {
    const registry = createBundleStorageRegistry();
    registry.addFactory('azure', () => stub);

    // The set of valid names depends on which modules this backend installs,
    // so the reader cannot look them up. The error has to carry them.
    await expect(
      registry.create({ config: configFor({ type: 'gcs' }), logger }),
    ).rejects.toThrow(
      'Unknown colophon.storage.type "gcs"; registered types are "azure", "local", "s3". Register another with colophonStorageExtensionPoint from a backend module.',
    );
  });

  it('refuses a second factory for a name already taken', () => {
    const registry = createBundleStorageRegistry();
    registry.addFactory('azure', () => stub);

    expect(() => registry.addFactory('azure', () => stub)).toThrow(
      'A colophon.storage factory named "azure" is already registered',
    );
    // Including the built-ins: silently replacing `local` would change where
    // an existing deployment reads from without changing its config.
    expect(() => registry.addFactory('local', () => stub)).toThrow(
      'A colophon.storage factory named "local" is already registered',
    );
  });

  it('names the factory that threw', async () => {
    const registry = createBundleStorageRegistry();
    registry.addFactory('azure', () => {
      throw new NotFoundError('AZURE_STORAGE_KEY is not set');
    });

    await expect(
      registry.create({ config: configFor({ type: 'azure' }), logger }),
    ).rejects.toThrow(
      'The colophon.storage factory for type "azure" failed; caused by NotFoundError: AZURE_STORAGE_KEY is not set',
    );
  });

  it('awaits a factory that returns a promise', async () => {
    const registry = createBundleStorageRegistry();
    registry.addFactory('azure', async () => stub);

    await expect(
      registry.create({ config: configFor({ type: 'azure' }), logger }),
    ).resolves.toBe(stub);
  });
});
