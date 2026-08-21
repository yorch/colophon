import type { Entity } from '@backstage/catalog-model';
import {
  type BundleRef,
  COLOPHON_ANNOTATION,
  isWithinSubpath,
  parseBundleRef,
} from '@brnby/colophon-common';

// Re-exported so callers in this package keep importing it from here, while
// the single definition lives in the contract both sides share.
export { isWithinSubpath };

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
