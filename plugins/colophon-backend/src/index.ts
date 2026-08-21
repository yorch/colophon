/**
 * The Colophon backend plugin.
 *
 * Install the default export in your backend, and the search module
 * separately if you want documentation in portal-wide search:
 *
 * ```ts
 * backend.add(import('@brnby/plugin-colophon-backend'));
 * backend.add(
 *   import('@brnby/plugin-colophon-backend/alpha').then(m => m.searchModuleColophonCollator),
 * );
 * ```
 */

export type { ColophonConfig } from './config';
export { readColophonConfig } from './config';
export { colophonPlugin as default } from './plugin';
export type { ColophonDocument } from './search/DefaultColophonCollatorFactory';
export {
  COLOPHON_DOCUMENT_TYPE,
  DefaultColophonCollatorFactory,
} from './search/DefaultColophonCollatorFactory';
export { searchModuleColophonCollator } from './search/module';
export type {
  ColophonServiceOptions,
  IngestResult,
  ResolvedPage,
} from './service/ColophonService';
export { ColophonService } from './service/ColophonService';
export { createColophonService } from './service/createColophonService';
