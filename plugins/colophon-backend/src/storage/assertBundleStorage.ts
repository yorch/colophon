import { InputError } from '@backstage/errors';
import type { BundleStorage } from './types';

/**
 * Checks a value really is a store, before anything holds onto it.
 *
 * TypeScript catches the naive mistake and nothing else. A cast through
 * `any`, a JavaScript adopter, or an SDK object that is duck-typed close
 * enough to satisfy the compiler all reach here intact — and then the backend
 * starts cleanly and fails on the first page anyone opens with
 * `storage.get is not a function`, a stack that names neither the factory nor
 * the config key that chose it.
 *
 * The extension point's documented promise is that a broken store is a
 * startup failure. This is what keeps it true for the case types cannot see.
 */
export function assertBundleStorage(
  value: unknown,
  source: string,
): BundleStorage {
  const storage = value as Partial<BundleStorage> | undefined;
  for (const method of ['has', 'get', 'put'] as const) {
    if (typeof storage?.[method] !== 'function') {
      throw new InputError(
        `${source} did not produce a BundleStorage: ${method}() is missing`,
      );
    }
  }
  return storage as BundleStorage;
}
