import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { ConflictError, ForwardedError, InputError } from '@backstage/errors';
import { assertBundleStorage } from './assertBundleStorage';
import type { ColophonStorageExtensionPoint } from './extensionPoint';
import type {
  BundleStorage,
  BundleStorageFactory,
  BundleStorageRegistration,
} from './types';

/**
 * The registry behind `colophonStorageExtensionPoint`.
 *
 * Not exported from the package entry point, which is the boundary that
 * matters: adopters register factories and select one with config, and never
 * need to hold the registry. `addFactory` therefore stays the only way in, so
 * `create` can assume every name it knows arrived through the duplicate check.
 *
 * Registration and construction are separate phases because the backend
 * initialises every module of a plugin before the plugin itself. The plugin
 * registers this in `register()` and calls `create` from its own `init()`,
 * which is the point at which the module set is closed — a factory added
 * later could not affect a store that had already been built, so `create`
 * closes the registry rather than letting one be added and ignored.
 */
export class BundleStorageRegistry implements ColophonStorageExtensionPoint {
  readonly #factories = new Map<string, BundleStorageFactory>();
  #built = false;

  addFactory({ name, factory }: BundleStorageRegistration): void {
    if (this.#built) {
      // Reachable, not theoretical: plugin lifecycle startup hooks run after
      // plugin init, so a module that stashes the extension point and calls
      // this from one would otherwise register a store nothing can ever use.
      throw new ConflictError(
        `A colophon.storage factory named "${name}" was registered after the store was built`,
      );
    }
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
    this.#built = true;

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

    let built: unknown;
    try {
      built = await factory({
        config: storage?.getOptionalConfig(type),
        // Tagged so an adopter store's own lines are attributable in a
        // production log, where several plugins write under one logger.
        logger: options.logger.child({ storage: type }),
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

    // Outside the catch, so this reads as its own failure rather than as the
    // factory having thrown — it did not; it returned the wrong thing.
    const result = assertBundleStorage(
      built,
      `The colophon.storage factory for type "${type}"`,
    );
    // The one line that says where documentation is being read from. Nothing
    // said so before, and `storage.local.root` silently resolving to the
    // wrong directory is a bug this project has already shipped once.
    options.logger.info(`Colophon bundle storage: type "${type}"`);
    return result;
  }
}
