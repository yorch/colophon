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
  /** Aborts the pass when the scheduler's timeout fires. */
  abortSignal?: AbortSignal;
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

  if (links.length === 0) {
    // A wholesale replace with nothing is how EVERY bundle in the deployment
    // silently becomes unlinked — and an unlinked bundle skips the catalog
    // visibility gate, so a transient catalog fault would quietly widen
    // access across the board until a later pass repaired it.
    //
    // "No annotated entities" and "the catalog told us nothing" look
    // identical in the result above, so ask a second question to tell them
    // apart: does the catalog have any entities at all? If it does, nobody
    // has annotated one and the empty set is the truth. If it does not, the
    // catalog is mid-refresh or invisible to these credentials, and the
    // previous links are better than none.
    const { items: anyEntity } = await options.catalog.getEntities(
      { fields: ['kind'], limit: 1 },
      { credentials },
    );
    if (anyEntity.length === 0) {
      options.logger.warn(
        'Skipping entity link sync: the catalog returned no entities at all, ' +
          'so the existing links are kept rather than cleared',
      );
      return { linked: 0, skipped };
    }
  }

  if (options.abortSignal?.aborted) {
    // Abandoning before the write is the point: a pass that outran its
    // timeout may be racing a newer one, and the loser must not be the
    // writer.
    options.logger.warn('Entity link sync aborted before writing');
    return { linked: 0, skipped };
  }

  await options.db.replaceEntityLinks(links);
  options.logger.info(
    `Colophon entity links: ${links.length} linked, ${skipped} skipped`,
  );
  return { linked: links.length, skipped };
}
