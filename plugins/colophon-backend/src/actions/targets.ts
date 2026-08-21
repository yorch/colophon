import { InputError, NotFoundError } from '@backstage/errors';
import type { ColophonDatabase, EntityLinkRecord } from '../database';

export interface BundleTarget {
  bundleId: string;
  /** Slug prefix the caller is scoped to, when reached via an entity. */
  subpath?: string;
  entityRef?: string;
}

/**
 * Turns "which docs?" into a bundle.
 *
 * Agents overwhelmingly know an entity ref — that is what the catalog gave
 * them — and only rarely a bundle id, so `entityRef` is the primary form and
 * `bundleId` the escape hatch. Exactly one must be supplied; accepting both
 * silently would hide a caller bug.
 */
export async function resolveTarget(
  db: ColophonDatabase,
  input: { entityRef?: string; bundleId?: string },
): Promise<BundleTarget> {
  if (Boolean(input.entityRef) === Boolean(input.bundleId)) {
    throw new InputError('Provide exactly one of entityRef or bundleId');
  }
  if (input.bundleId) {
    return { bundleId: input.bundleId };
  }
  const entityRef = input.entityRef as string;
  const [link] = await db.listEntityLinks({ entityRefs: [entityRef] });
  if (!link) {
    throw new NotFoundError(
      `Entity "${entityRef}" has no Colophon documentation`,
    );
  }
  return { bundleId: link.bundleId, subpath: link.subpath, entityRef };
}

/** True when a slug is inside a target's scope. */
export function inScope(target: BundleTarget, slug: string): boolean {
  return (
    !target.subpath ||
    slug === target.subpath ||
    slug.startsWith(`${target.subpath}/`)
  );
}

/** The most specific entity attached to a slug, for building a deep link. */
export function linkForSlug(
  links: EntityLinkRecord[],
  bundleId: string,
  slug: string,
): EntityLinkRecord | undefined {
  return links
    .filter(
      link =>
        link.bundleId === bundleId &&
        (!link.subpath ||
          slug === link.subpath ||
          slug.startsWith(`${link.subpath}/`)),
    )
    .sort((a, b) => (b.subpath?.length ?? 0) - (a.subpath?.length ?? 0))[0];
}
