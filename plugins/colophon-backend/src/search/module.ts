import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
// The search index registry is only exposed on the /alpha subpath. It is
// marked @alpha upstream, so this import is a known upgrade checkpoint.
import { searchIndexRegistryExtensionPoint } from '@backstage/plugin-search-backend-node/alpha';
import { readColophonConfig } from '../config';
import { DefaultColophonCollatorFactory } from './DefaultColophonCollatorFactory';

/**
 * Projects Colophon documentation into Backstage Search.
 *
 * Registered as a module on the `search` plugin rather than from the Colophon
 * plugin itself, because the index registry belongs to the search backend and
 * a plugin may only contribute to another plugin through a module.
 *
 * Note what it does NOT take: a database. Running under the `search` plugin
 * id means `coreServices.database` would hand back the search plugin's own
 * database, not Colophon's — every plugin gets its own. The collator reads
 * over HTTP instead.
 */
export const searchModuleColophonCollator = createBackendModule({
  pluginId: 'search',
  moduleId: 'colophon-collator',
  register(env) {
    env.registerInit({
      deps: {
        indexRegistry: searchIndexRegistryExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
      },
      async init({
        indexRegistry,
        config,
        logger,
        scheduler,
        discovery,
        auth,
      }) {
        const { appBaseUrl, searchIndexSchedule } = readColophonConfig(config);

        indexRegistry.addCollator({
          schedule: scheduler.createScheduledTaskRunner(searchIndexSchedule),
          factory: new DefaultColophonCollatorFactory({
            discovery,
            auth,
            logger,
            appBaseUrl,
          }),
        });
      },
    });
  },
});
