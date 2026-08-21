import {
  createPermission,
  type Permission,
} from '@backstage/plugin-permission-common';

/**
 * Reading documentation.
 *
 * A basic permission rather than a resource permission, and that is a
 * considered choice. A resource permission must always name a resource, and a
 * bundle that no catalog entity references has none — so a resource-scoped
 * read would have no way to express the unlinked case at all.
 *
 * Per-entity visibility is therefore delegated to the catalog rather than
 * re-decided here: the backend asks the catalog, with the caller's own
 * credentials, whether it can see the entity a bundle is attached to. That
 * cannot drift from what the catalog itself would answer, which a parallel
 * policy eventually would.
 *
 * ## What this does and does not do by default
 *
 * With no permission policy installed, Backstage allows everything, so
 * documentation stays readable by every authenticated user. That is the same
 * default TechDocs has and it is almost certainly what a first-time adopter
 * wants. The point of defining the permission is that an adopter who needs
 * documentation to follow catalog visibility can now write:
 *
 * ```ts
 * if (isPermission(request.permission, colophonDocsReadPermission)) {
 *   return { result: AuthorizeResult.DENY };   // e.g. for guest identities
 * }
 * ```
 *
 * and have it apply to the HTTP routes, the MCP actions, and portal search
 * alike — rather than discovering that only one of the three was filtered.
 */
export const colophonDocsReadPermission = createPermission({
  name: 'colophon.docs.read',
  attributes: { action: 'read' },
});

/**
 * Publishing a revision and repointing a channel.
 *
 * Separate from reading because the callers are different: CI publishes with
 * a service token while people and agents only ever read. Splitting them lets
 * a deployment grant write to exactly one identity.
 */
export const colophonDocsPublishPermission = createPermission({
  name: 'colophon.docs.publish',
  attributes: { action: 'create' },
});

export const colophonPermissions: Permission[] = [
  colophonDocsReadPermission,
  colophonDocsPublishPermission,
];
