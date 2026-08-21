import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
// The search index registry is only exposed on the /alpha subpath. It is
// marked @alpha upstream, so this import is a known upgrade checkpoint.
import { searchIndexRegistryExtensionPoint } from '@backstage/plugin-search-backend-node/alpha';
import { readColophonConfig } from '../config';
import { createColophonService } from '../service/createColophonService';
import { DefaultColophonCollatorFactory } from './DefaultColophonCollatorFactory';

/**
 * Projects Colophon documentation into Backstage Search.
 *
 * Registered as a module on the `search` plugin rather than from the Colophon
 * plugin itself, because the index registry belongs to the search backend and
 * a plugin may only contribute to another plugin through a module.
 */
export const searchModuleColophonCollator = createBackendModule({
  pluginId: 'search',
  moduleId: 'colophon-collator',
  register(env) {
    env.registerInit({
      deps: {
        indexRegistry: searchIndexRegistryExtensionPoint,
        config: coreServices.rootConfig,
        database: coreServices.database,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({ indexRegistry, config, database, logger, scheduler }) {
        const { appBaseUrl } = readColophonConfig(config);
        const colophon = await createColophonService({
          config,
          database,
          logger,
        });

        indexRegistry.addCollator({
          schedule: scheduler.createScheduledTaskRunner(
            readColophonConfig(config).schedule,
          ),
          factory: new DefaultColophonCollatorFactory({
            colophon,
            logger,
            appBaseUrl,
          }),
        });
      },
    });
  },
});
