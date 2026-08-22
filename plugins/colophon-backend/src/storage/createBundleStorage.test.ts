import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mockServices } from '@backstage/backend-test-utils';
import { createBundleStorage } from './createBundleStorage';
import { LocalBundleStorage } from './LocalBundleStorage';

/** Fixtures live under the repo's tmp/, never the system temp directory. */
const TMP_ROOT = join(__dirname, '../../../../tmp');

/**
 * These keys are a contract with `app-config.yaml`, and an unread config key
 * is not an error — it is silently dropped. That is how
 * `storage.local.directory` came to be documented in three places while the
 * code read `storage.local.root`: publishes succeeded, every read afterwards
 * 404'd, and no test noticed, because none of them asserted WHERE the storage
 * pointed. Constructing the object proves nothing; only reading a byte back
 * through it does.
 */
describe('createBundleStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(TMP_ROOT, 'storage-'));
    await writeFile(join(dir, 'probe'), 'hello');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const build = (local: object) =>
    createBundleStorage(
      mockServices.rootConfig({
        data: { colophon: { storage: { type: 'local', local } } },
      }),
    );

  it('reads the documented storage.local.directory key', async () => {
    const storage = build({ directory: dir });
    expect(storage).toBeInstanceOf(LocalBundleStorage);
    // Reaches a file that only exists under the configured directory, so this
    // fails if the key was ignored and the default root was used instead.
    expect((await storage.get('probe')).toString()).toBe('hello');
  });

  it('ignores a key it does not define, rather than guessing', async () => {
    // `root` was the name the code used to read. Nothing should answer to it
    // now, and the failure has to be visible rather than a silent fallback to
    // a directory that happens to be empty.
    const storage = build({ root: dir });
    await expect(storage.get('probe')).rejects.toThrow(/probe/);
  });

  it('rejects an unknown storage type by name', () => {
    expect(() =>
      createBundleStorage(
        mockServices.rootConfig({
          data: { colophon: { storage: { type: 'gcs' } } },
        }),
      ),
    ).toThrow(/gcs/);
  });

  it('requires a bucket for s3', () => {
    expect(() =>
      createBundleStorage(
        mockServices.rootConfig({
          data: { colophon: { storage: { type: 's3' } } },
        }),
      ),
    ).toThrow(/bucket is required/);
  });
});
