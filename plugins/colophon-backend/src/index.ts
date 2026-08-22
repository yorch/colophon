/**
 * The Colophon backend plugin.
 *
 * Install the default export in your backend, and the search module
 * separately if you want documentation in portal-wide search:
 *
 * ```ts
 * import { searchModuleColophonCollator } from '@brnby/plugin-colophon-backend';
 *
 * backend.add(import('@brnby/plugin-colophon-backend'));
 * backend.add(searchModuleColophonCollator);
 * ```
 *
 * The collator is a named export of this entry point rather than a `/alpha`
 * subpath: this package declares no `exports` map, so a subpath import does
 * not resolve. `backend.add` also takes a feature or a promise of a module
 * NAMESPACE, not a promise of a feature, so the static import is both shorter
 * and the only shape that type-checks.
 */

export type { ColophonConfig } from './config';
export { readColophonConfig } from './config';
export {
  colophonDocsPublishPermission,
  colophonDocsReadPermission,
  colophonPermissions,
} from './permissions';
export { colophonPlugin as default } from './plugin';
export type { ColophonDocument } from './search/DefaultColophonCollatorFactory';
export { DefaultColophonCollatorFactory } from './search/DefaultColophonCollatorFactory';
export { searchModuleColophonCollator } from './search/module';
export type { DocsAuthorizer } from './service/authorize';
export { createDocsAuthorizer } from './service/authorize';
export type {
  ColophonServiceOptions,
  IngestResult,
  ResolvedPage,
} from './service/ColophonService';
export { ColophonService } from './service/ColophonService';
export { createColophonService } from './service/createColophonService';
