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
 *
 * **Evolution policy: any method added here in future will be optional.**
 * Every adopter store implements this interface, so a new required method
 * breaks all of them at once — which is exactly what adding `list` and
 * `delete` did to the CLI's copy. A streaming `getStream` is the obvious
 * candidate, and it will arrive optional with `get` as the fallback.
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
  /** Tagged with the store's name, so its lines are attributable in production. */
  logger: LoggerService;
}

/**
 * Builds one store from its own slice of config.
 *
 * Allowed to be async so a factory can do setup that genuinely cannot be
 * deferred — reading a credential file, resolving a token. Anything that can
 * be lazy should be, and the reason is stronger than tidiness: this is
 * awaited on the startup path with no timeout, so a factory that takes two
 * seconds delays every plugin by two seconds, and a factory that never
 * resolves never starts the backend at all.
 */
export type BundleStorageFactory = (
  options: BundleStorageFactoryOptions,
) => BundleStorage | Promise<BundleStorage>;

/**
 * One store offered to `colophon.storage.type`.
 *
 * An options object for the same reason `BundleStorageFactoryOptions` is one,
 * and the reason applies harder here: this is the extension point's own
 * method, so its signature is the hardest thing in the package to change
 * later. `description`, an explicit `override`, a deprecation marker are each
 * free to add now and a breaking change once anyone has called it. Backstage's
 * closest analogue — `AuthProvidersExtensionPoint.registerProvider` — takes an
 * object for exactly two fields.
 */
export interface BundleStorageRegistration {
  /** The value `colophon.storage.type` must carry to select this store. */
  name: string;
  factory: BundleStorageFactory;
}
