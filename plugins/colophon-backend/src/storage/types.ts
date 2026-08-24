import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';

/**
 * Blob access for the backend.
 *
 * Deliberately three methods. The backend only ever READS published bundles;
 * `put` exists because tests and local development need to seed a store, and
 * because a single interface is easier to reason about than a read/write
 * split. Production deployments are expected to hand the backend read-only
 * credentials, which is why nothing on the ingestion path calls `put`.
 *
 * Published API since 0.5: an adopter implements this to put Colophon on a
 * store that does not ship with it. It is NOT the CLI's `BundleStorage` —
 * that one also has `list` and `delete`, which only the publisher needs. See
 * `docs/guides/custom-storage.md` for why the two stay separate.
 */
export interface BundleStorage {
  has(key: string): Promise<boolean>;
  /** Throws `NotFoundError` when the key is absent. */
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

/**
 * What a storage factory is handed.
 *
 * An options object rather than positional arguments because this is a
 * published contract: adding a field here is additive, adding a second
 * parameter is not.
 *
 * Note what is absent: the root config. A module registering a factory
 * already asks for `coreServices.rootConfig` in its own `deps` and can close
 * over it, so passing it again would only invite factories to read config
 * from outside their own key.
 */
export interface BundleStorageFactoryOptions {
  /**
   * `colophon.storage.<name>` — the factory's own slice, absent when the
   * adopter set no keys under it.
   *
   * A factory whose configuration is mandatory should throw when a value is
   * missing rather than default: it runs during backend startup, so the
   * failure is loud and immediate instead of a 404 on the first read.
   */
  config?: Config;
  logger: LoggerService;
}

/**
 * Builds one store from its own slice of config.
 *
 * Allowed to be async so a factory can do setup that genuinely cannot be
 * deferred — reading a credential file, resolving a token. Anything that can
 * be lazy should be: this runs on the startup path and a slow factory delays
 * the whole backend.
 */
export type BundleStorageFactory = (
  options: BundleStorageFactoryOptions,
) => BundleStorage | Promise<BundleStorage>;
