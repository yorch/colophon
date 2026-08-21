import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import { CATALOG_FILTER_EXISTS } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { COLOPHON_ANNOTATION, parseBundleRef } from '@brnby/colophon-common';
import type { ColophonDatabase, EntityLinkRecord } from '../database';

/**
 * Rebuilds `colophon_entity_links` from the catalog.
 *
 * A full replace rather than an incremental diff: the table is tiny, the
 * catalog is the sole source of truth, and a rebuild cannot leave a stale row
 * pointing an entity at a bundle whose annotation was removed.
 */
export async function syncEntityLinks(options: {
  catalog: CatalogService;
  db: ColophonDatabase;
  auth: AuthService;
  logger: LoggerService;
}): Promise<{ linked: number; skipped: number }> {
  const credentials = await options.auth.getOwnServiceCredentials();
  const { items } = await options.catalog.getEntities(
    {
      filter: {
        [`metadata.annotations.${COLOPHON_ANNOTATION}`]: CATALOG_FILTER_EXISTS,
      },
      // All annotations rather than just ours: the catalog's field selector
      // splits on '.', and this annotation key contains one.
      fields: [
        'kind',
        'metadata.name',
        'metadata.namespace',
        'metadata.annotations',
      ],
    },
    { credentials },
  );

  const links: EntityLinkRecord[] = [];
  let skipped = 0;
  for (const entity of items) {
    const annotation = entity.metadata.annotations?.[COLOPHON_ANNOTATION];
    if (!annotation) {
      continue;
    }
    const entityRef = stringifyEntityRef(entity);
    try {
      const ref = parseBundleRef(annotation);
      links.push({
        entityRef,
        bundleId: ref.bundleId,
        subpath: ref.subpath,
      });
    } catch (error) {
      // A malformed annotation is an authoring mistake in one repository; it
      // must not abort the sync for every other entity.
      skipped += 1;
      options.logger.warn(
        `Ignoring ${COLOPHON_ANNOTATION} on ${entityRef}: ${error}`,
      );
    }
  }

  await options.db.replaceEntityLinks(links);
  options.logger.info(
    `Colophon entity links: ${links.length} linked, ${skipped} skipped`,
  );
  return { linked: links.length, skipped };
}
