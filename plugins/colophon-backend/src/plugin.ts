import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { registerColophonActions } from './actions';
import { syncEntityLinks } from './catalog/syncEntityLinks';
import { readColophonConfig } from './config';
import { createColophonService } from './service/createColophonService';
import { createRouter } from './service/router';

/**
 * The Colophon backend.
 *
 * Serves published documentation over HTTP, keeps the catalog-to-bundle map
 * in step on a schedule, and registers the read-only actions that the MCP
 * Actions Backend exposes to agents.
 */
export const colophonPlugin = createBackendPlugin({
  pluginId: 'colophon',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        database: coreServices.database,
        logger: coreServices.logger,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        scheduler: coreServices.scheduler,
        auth: coreServices.auth,
        actionsRegistry: actionsRegistryServiceRef,
        catalog: catalogServiceRef,
      },
      async init({
        config,
        database,
        logger,
        httpAuth,
        httpRouter,
        scheduler,
        auth,
        actionsRegistry,
        catalog,
      }) {
        const { appBaseUrl, schedule } = readColophonConfig(config);
        const colophon = await createColophonService({
          config,
          database,
          logger,
        });

        httpRouter.use(
          await createRouter({ colophon, httpAuth, logger, appBaseUrl }),
        );

        registerColophonActions({ actionsRegistry, colophon, appBaseUrl });

        await scheduler.scheduleTask({
          id: 'colophon-sync-entity-links',
          ...schedule,
          fn: async () => {
            await syncEntityLinks({ catalog, auth, db: colophon.db, logger });
          },
        });
      },
    });
  },
});
