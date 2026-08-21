import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import type { BundleStorage } from './types';

/**
 * Filesystem-backed storage for local development and tests.
 *
 * Storage keys are path-like by design (see `colophon-common/storage.ts`), so
 * they map onto directories unchanged and a developer can inspect a bundle
 * with `ls`. Keys are still resolved through `resolveSafeChildPath` — they
 * reach this class from HTTP input, and a validated bundle id today is not a
 * reason to skip the check tomorrow.
 */
export class LocalBundleStorage implements BundleStorage {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  async has(key: string): Promise<boolean> {
    return existsSync(this.#pathFor(key));
  }

  async get(key: string): Promise<Buffer> {
    const path = this.#pathFor(key);
    try {
      return await readFile(path);
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

  #pathFor(key: string): string {
    return resolveSafeChildPath(this.#root, key);
  }
}
