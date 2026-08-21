import type {
  BackstageCredentials,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { NotAllowedError, NotFoundError } from '@backstage/errors';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { ColophonDatabase } from '../database';
import {
  colophonDocsPublishPermission,
  colophonDocsReadPermission,
} from '../permissions';

export interface DocsAuthorizer {
  /** Throws unless the caller may read this bundle's documentation. */
  assertCanRead(
    bundleId: string,
    credentials: BackstageCredentials,
  ): Promise<void>;
  /**
   * Narrows a set of bundle ids to those the caller may read.
   *
   * Listing and searching need this rather than assertCanRead, because they
   * must silently omit what the caller cannot see instead of failing the
   * whole request the moment one result is out of reach.
   */
  filterReadable(
    bundleIds: string[],
    credentials: BackstageCredentials,
  ): Promise<Set<string>>;
  /** Throws unless the caller may publish a revision. */
  assertCanPublish(credentials: BackstageCredentials): Promise<void>;
}

/**
 * One decision point for documentation reads.
 *
 * The HTTP routes and the MCP actions both go through this, because they
 * serve the same content to the same callers, and any difference between them
 * is a way around whichever is stricter.
 *
 * Two gates, in order:
 *
 *  1. `colophon.docs.read`, so a deployment can turn documentation off for a
 *     class of principals outright.
 *  2. For a bundle attached to catalog entities, whether the caller can
 *     actually SEE one of those entities. This is delegation rather than a
 *     second policy: the catalog already enforces entity visibility, so
 *     asking it with the caller's own credentials gives "documentation is as
 *     visible as the component it documents" for free, and cannot drift from
 *     what the catalog itself would answer.
 *
 * A bundle no entity references has nothing to delegate to and is governed by
 * the first gate alone. Denying it instead would make the plugin look broken
 * whenever documentation is published before its catalog entry lands.
 */
export function createDocsAuthorizer(options: {
  permissions: PermissionsService;
  catalog: CatalogService;
  db: ColophonDatabase;
}): DocsAuthorizer {
  return {
    async assertCanRead(bundleId, credentials) {
      const [decision] = await options.permissions.authorize(
        [{ permission: colophonDocsReadPermission }],
        { credentials },
      );
      if (decision.result !== AuthorizeResult.ALLOW) {
        throw notFound(bundleId);
      }

      const links = await options.db.listEntityLinks({ bundleIds: [bundleId] });
      if (links.length === 0) {
        return;
      }

      const { items } = await options.catalog.getEntitiesByRefs(
        { entityRefs: links.map(link => link.entityRef) },
        { credentials },
      );

      // Any visible entity is enough: a docs tree shared by several
      // components is readable by anyone who can see any one of them, which
      // is how a person would reason about a shared tree.
      if (items.some(Boolean)) {
        return;
      }
      throw notFound(bundleId);
    },

    async filterReadable(bundleIds, credentials) {
      if (bundleIds.length === 0) {
        return new Set();
      }

      const [decision] = await options.permissions.authorize(
        [{ permission: colophonDocsReadPermission }],
        { credentials },
      );
      if (decision.result !== AuthorizeResult.ALLOW) {
        return new Set();
      }

      const links = await options.db.listEntityLinks({ bundleIds });
      // Unlinked bundles have nothing to delegate to and pass on the first
      // gate alone, exactly as in assertCanRead.
      const linked = new Map<string, string[]>();
      for (const link of links) {
        linked.set(link.bundleId, [
          ...(linked.get(link.bundleId) ?? []),
          link.entityRef,
        ]);
      }

      const refs = [...new Set(links.map(link => link.entityRef))];
      // One catalog call for every entity involved rather than one per
      // bundle: a portal-wide search touches many bundles at once.
      const visible = new Set<string>();
      if (refs.length > 0) {
        const { items } = await options.catalog.getEntitiesByRefs(
          { entityRefs: refs },
          { credentials },
        );
        items.forEach((entity, index) => {
          if (entity) {
            visible.add(refs[index]);
          }
        });
      }

      return new Set(
        bundleIds.filter(bundleId => {
          const entityRefs = linked.get(bundleId);
          return !entityRefs || entityRefs.some(ref => visible.has(ref));
        }),
      );
    },

    async assertCanPublish(credentials) {
      const [decision] = await options.permissions.authorize(
        [{ permission: colophonDocsPublishPermission }],
        { credentials },
      );
      if (decision.result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError(
          'Not allowed to publish Colophon documentation',
        );
      }
    },
  };
}

/**
 * NotFound rather than Forbidden, deliberately.
 *
 * Distinguishing "exists but you may not see it" from "does not exist" tells
 * an unauthorised caller which bundle ids are real — and a bundle id is a
 * repository name.
 */
function notFound(bundleId: string): NotFoundError {
  return new NotFoundError(`Unknown bundle "${bundleId}"`);
}
