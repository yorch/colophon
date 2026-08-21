import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { registerColophonActions } from './actions';
import { syncEntityLinks } from './catalog/syncEntityLinks';
import { readColophonConfig } from './config';
import { createDocsAuthorizer } from './service/authorize';
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
        permissions: coreServices.permissions,
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
        permissions,
      }) {
        const { appBaseUrl, entityLinkSchedule } = readColophonConfig(config);
        const colophon = await createColophonService({
          config,
          database,
          logger,
        });

        // One authorizer, shared by the HTTP routes and the MCP actions:
        // they serve the same content to the same callers, and a difference
        // between them is a way around whichever is stricter.
        const authorizer = createDocsAuthorizer({
          permissions,
          catalog,
          db: colophon.db,
        });

        httpRouter.use(
          await createRouter({
            colophon,
            httpAuth,
            authorizer,
            logger,
            appBaseUrl,
          }),
        );

        registerColophonActions({
          actionsRegistry,
          colophon,
          authorizer,
          appBaseUrl,
        });

        await scheduler.scheduleTask({
          id: 'colophon-sync-entity-links',
          ...entityLinkSchedule,
          fn: async () => {
            try {
              await syncEntityLinks({ catalog, auth, db: colophon.db, logger });
            } catch (error) {
              // Caught here rather than relying on the scheduler's behaviour
              // for a rejected task, which the installed types do not state.
              // A catalog outage should cost one skipped pass, visibly — not
              // a schedule that may or may not still be running.
              //
              // Safe to swallow because replaceEntityLinks is transactional:
              // a failed pass leaves the previous links intact rather than
              // half-applied, so the next one starts from a consistent map.
              logger.warn(
                `Entity link sync failed; the previous links remain in effect and the next pass will retry: ${error}`,
              );
            }
          },
        });
      },
    });
  },
});
