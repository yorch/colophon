import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type { BundleStorageRegistration } from './types';

/**
 * Adds a named bundle store to the set `colophon.storage.type` can select.
 *
 * A named factory registry rather than a "set the storage" seam, because
 * where bundles live is a deployment decision and deployment decisions belong
 * in `app-config.yaml`. A `setStorage()` extension point would move the choice
 * into TypeScript, so staging and production would differ by a code branch
 * rather than by a config key — and the same backend image could no longer be
 * promoted between them.
 *
 * The two built-ins register through this same `addFactory` call before any
 * module runs, so there is exactly one lookup path. An adopter's factory is
 * resolved by the code that resolves `local`, which is the only arrangement
 * where the adopter path cannot rot unnoticed.
 */
export interface ColophonStorageExtensionPoint {
  /**
   * Makes `colophon.storage.type: <name>` build a store with `factory`.
   *
   * Throws when `name` is already taken — including by `local` or `s3`.
   * Silently replacing a store is the one outcome worth refusing: two modules
   * that both claim a name disagree about where the documentation is, and
   * whichever loses does so by initialisation order.
   *
   * Also throws once the store has been built. Registering later is
   * reachable — a module can stash this and call it from a lifecycle startup
   * hook, which runs after the plugin has already resolved its store — and
   * accepting it would mean a factory that is present, selectable in config,
   * and used by nothing.
   */
  addFactory(registration: BundleStorageRegistration): void;
}

/**
 * Extension point for registering bundle stores.
 *
 * ```ts
 * export const colophonModuleAzureStorage = createBackendModule({
 *   pluginId: 'colophon',
 *   moduleId: 'azure-storage',
 *   register(env) {
 *     env.registerInit({
 *       deps: { colophonStorage: colophonStorageExtensionPoint },
 *       async init({ colophonStorage }) {
 *         colophonStorage.addFactory({
 *           name: 'azure',
 *           factory: ({ config }) =>
 *             new AzureBundleStorage(config?.getString('container')),
 *         });
 *       },
 *     });
 *   },
 * });
 * ```
 */
export const colophonStorageExtensionPoint =
  createExtensionPoint<ColophonStorageExtensionPoint>({
    id: 'colophon.storage',
  });
