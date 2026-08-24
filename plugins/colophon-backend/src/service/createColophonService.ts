import type {
  DatabaseService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { readColophonConfig } from '../config';
import { ColophonDatabase } from '../database';
import {
  assertBundleStorage,
  type BundleStorage,
  createBundleStorage,
} from '../storage';
import { ColophonService } from './ColophonService';

/**
 * Builds the service from Backstage's core services.
 *
 * Both the plugin and the search module need an identically configured
 * instance, and they initialise independently — so construction lives here
 * rather than being duplicated at each call site and drifting.
 */
export async function createColophonService(options: {
  config: RootConfigService;
  database: DatabaseService;
  logger: LoggerService;
  /**
   * The store to read bundles from.
   *
   * The plugin passes one built from the factories its modules registered.
   * Left out, `colophon.storage` selects from the built-in `local` and `s3`
   * alone — which is all a caller outside the backend system could have had
   * anyway, since there are no modules to register anything.
   */
  storage?: BundleStorage;
}): Promise<ColophonService> {
  const { chunking, retention } = readColophonConfig(options.config);
  return new ColophonService({
    db: await ColophonDatabase.create({ database: options.database }),
    // `in` rather than `??`. The plugin ALWAYS passes a store, so an
    // undefined here is a bug — and `??` would answer that bug by silently
    // rebuilding from a fresh, BUILT-INS-ONLY registry, telling an operator
    // whose module registered `azure` that the registered types are
    // "local", "s3" and to register the thing they already registered.
    storage:
      'storage' in options
        ? assertBundleStorage(
            options.storage,
            'The storage given to createColophonService',
          )
        : await createBundleStorage(options),
    logger: options.logger,
    chunking,
    retention,
  });
}
