import type {
  DatabaseService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { readColophonConfig } from '../config';
import { ColophonDatabase } from '../database';
import { createBundleStorage } from '../storage';
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
}): Promise<ColophonService> {
  const { chunking, retention } = readColophonConfig(options.config);
  return new ColophonService({
    db: await ColophonDatabase.create({ database: options.database }),
    storage: createBundleStorage(options.config),
    logger: options.logger,
    chunking,
    retention,
  });
}
