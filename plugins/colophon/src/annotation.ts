import type { Entity } from '@backstage/catalog-model';
import {
  type BundleRef,
  COLOPHON_ANNOTATION,
  parseBundleRef,
} from '@brnby/colophon-common';

/**
 * Reads an entity's Colophon annotation.
 *
 * Returns undefined rather than throwing for a malformed value: a typo in one
 * entity's YAML should hide that entity's docs tab, not break the catalog
 * page it sits on.
 */
export function readBundleRef(entity: Entity): BundleRef | undefined {
  const raw = entity.metadata.annotations?.[COLOPHON_ANNOTATION];
  if (!raw?.trim()) {
    return undefined;
  }
  try {
    return parseBundleRef(raw);
  } catch {
    return undefined;
  }
}

/** Whether to show the docs tab for an entity. */
export function isColophonAvailable(entity: Entity): boolean {
  return readBundleRef(entity) !== undefined;
}

/**
 * Whether a page belongs to the subtree an entity is scoped to.
 *
 * The `#subpath` form is what lets several catalog components share one docs
 * tree: each entity's tab shows only its own section. Matching on a segment
 * boundary keeps `services/billing` from also matching `services/billing-v2`.
 */
export function isWithinSubpath(slug: string, subpath?: string): boolean {
  if (!subpath) {
    return true;
  }
  return slug === subpath || slug.startsWith(`${subpath}/`);
}
