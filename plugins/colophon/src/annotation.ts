import type { Entity } from '@backstage/catalog-model';
import type { ConfigApi } from '@backstage/core-plugin-api';
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
 * The annotation key this app is configured to read.
 *
 * `colophon.annotation` is declared `@visibility frontend` in this package's
 * own config.d.ts as well as the backend's, because config is filtered for
 * the browser against the dependency closure of the packages the APP depends
 * on — and an app depends on this package, not on the backend plugin.
 *
 * A blank string is treated as unset rather than as a key: an annotation
 * named "" matches nothing, and silently indexing nothing is precisely the
 * failure mode this project has already paid for once.
 */
export function readAnnotationKey(config: ConfigApi): string {
  return (
    config.getOptionalString('colophon.annotation')?.trim() ||
    COLOPHON_ANNOTATION
  );
}

/**
 * Reads an entity's Colophon annotation.
 *
 * Returns undefined rather than throwing for a malformed value: a typo in one
 * entity's YAML should hide that entity's docs tab, not break the catalog
 * page it sits on.
 */
export function readBundleRef(
  entity: Entity,
  annotationKey: string = COLOPHON_ANNOTATION,
): BundleRef | undefined {
  const raw = entity.metadata.annotations?.[annotationKey];
  if (!raw?.trim()) {
    return undefined;
  }
  try {
    return parseBundleRef(raw);
  } catch {
    return undefined;
  }
}

/**
 * Whether to show the docs tab for an entity.
 *
 * Deliberately NOT config-aware, and it cannot be: this is the default
 * `filter` of an EntityContentBlueprint, which the frontend system evaluates
 * as a plain predicate with no access to an API. An app that renames the
 * annotation overrides the filter in app-config instead — the blueprint
 * declares `filter` in its own config schema and config wins over the param
 * — which is the supported lever and is documented alongside the key.
 */
export function isColophonAvailable(entity: Entity): boolean {
  return readBundleRef(entity) !== undefined;
}
