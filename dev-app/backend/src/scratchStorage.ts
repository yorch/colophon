/**
 * A third bundle store, registered the way an adopter would register theirs.
 *
 * Colophon ships `local` and `s3`. Both are built by the same registry an
 * adopter's module contributes to — but the built-ins are registered by the
 * plugin itself, so a harness that only ran them would never boot a factory
 * that arrived from OUTSIDE the plugin. That is the case an organisation on
 * Azure Blob or GCS is in, and it is the one worth being able to run.
 *
 * Filesystem-backed rather than in-memory on purpose: `yarn dev:seed`
 * publishes through the real CLI, which writes blobs to the store directly
 * and only then tells the backend a revision exists. A store the publisher
 * cannot write into could be started but never read from, which would prove
 * nothing.
 *
 * Not a copy of `LocalBundleStorage` — that class is not exported, and an
 * adopter would not have it either. This implements `BundleStorage` from the
 * package's public entry point, which is the whole contract they get.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { LoggerService } from '@backstage/backend-plugin-api';
import {
  createBackendModule,
  resolveSafeChildPath,
} from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import {
  type BundleStorage,
  colophonStorageExtensionPoint,
} from '@brnby/plugin-colophon-backend';

class ScratchBundleStorage implements BundleStorage {
  readonly #root: string;
  readonly #logger: LoggerService;

  constructor(root: string, logger: LoggerService) {
    // Against the backend process's working directory, matching how the
    // shipped `local` store reads its own `directory` key.
    this.#root = resolve(root);
    this.#logger = logger;
  }

  async has(key: string): Promise<boolean> {
    return existsSync(this.#pathFor(key));
  }

  async get(key: string): Promise<Buffer> {
    // Logged so a browser session can be checked against the backend output:
    // a page rendering is not by itself evidence of WHICH store served it.
    this.#logger.info(`scratch storage read: ${key}`);
    try {
      return await readFile(this.#pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(`No object at storage key "${key}"`);
      }
      throw error;
    }
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.#pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  // Storage keys reach this from HTTP input, so they are resolved rather than
  // joined, exactly as the shipped stores do.
  #pathFor(key: string): string {
    return resolveSafeChildPath(this.#root, key);
  }
}

/**
 * Adds `colophon.storage.type: scratch` to the harness.
 *
 * Registered unconditionally; selecting it is a config choice. The committed
 * `app-config.yaml` stays on `local` so the harness keeps exercising a
 * built-in by default — switch in a gitignored `app-config.local.yaml`.
 */
export const colophonModuleScratchStorage = createBackendModule({
  pluginId: 'colophon',
  moduleId: 'scratch-storage',
  register(env) {
    env.registerInit({
      deps: { colophonStorage: colophonStorageExtensionPoint },
      async init({ colophonStorage }) {
        colophonStorage.addFactory('scratch', ({ config, logger }) => {
          // Required rather than defaulted: a store that silently pointed at
          // the wrong directory is the exact failure this plugin already paid
          // for once with `storage.local.root`.
          const directory = config?.getString('directory');
          if (!directory) {
            throw new Error('colophon.storage.scratch.directory is required');
          }
          logger.info(`scratch storage rooted at ${directory}`);
          return new ScratchBundleStorage(directory, logger);
        });
      },
    });
  },
});
