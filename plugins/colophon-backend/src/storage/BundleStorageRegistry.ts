import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { ConflictError, ForwardedError, InputError } from '@backstage/errors';
import type { ColophonStorageExtensionPoint } from './extensionPoint';
import type { BundleStorage, BundleStorageFactory } from './types';

/**
 * The registry behind `colophonStorageExtensionPoint`.
 *
 * Internal on purpose: adopters register factories and select one with
 * config, and never need to hold the registry. Keeping it unexported means
 * `addFactory` stays the only way in, so `create` can assume every name it
 * knows about arrived through the duplicate check.
 *
 * Registration and construction are separate phases because the backend
 * initialises every module of a plugin before the plugin itself. The plugin
 * registers this in `register()` and calls `create` from its own `init()`,
 * which is the point at which the module set is closed — a factory added
 * later could not affect a store that had already been built.
 */
export class BundleStorageRegistry implements ColophonStorageExtensionPoint {
  readonly #factories = new Map<string, BundleStorageFactory>();

  addFactory(name: string, factory: BundleStorageFactory): void {
    if (this.#factories.has(name)) {
      throw new ConflictError(
        `A colophon.storage factory named "${name}" is already registered`,
      );
    }
    this.#factories.set(name, factory);
  }

  /** Sorted, because the order is user-visible in the unknown-type error. */
  names(): string[] {
    return [...this.#factories.keys()].sort();
  }

  async create(options: {
    config: RootConfigService;
    logger: LoggerService;
  }): Promise<BundleStorage> {
    const storage = options.config.getOptionalConfig('colophon.storage');
    const type = storage?.getOptionalString('type') ?? 'local';

    const factory = this.#factories.get(type);
    if (!factory) {
      // Naming the registered types matters more here than in most errors:
      // the set is open, so the reader cannot look up what is valid. It
      // depends on which modules this backend happens to install.
      const registered = this.names()
        .map(name => `"${name}"`)
        .join(', ');
      throw new InputError(
        `Unknown colophon.storage.type "${type}"; registered types are ` +
          `${registered}. Register another with colophonStorageExtensionPoint ` +
          `from a backend module.`,
      );
    }

    try {
      return await factory({
        config: storage?.getOptionalConfig(type),
        logger: options.logger,
      });
    } catch (error) {
      // A factory throwing is a startup failure either way. Wrapping it names
      // WHICH factory: the cause is usually a missing key in someone else's
      // config schema, and the raw error rarely says which store it came from.
      throw new ForwardedError(
        `The colophon.storage factory for type "${type}" failed`,
        error,
      );
    }
  }
}
