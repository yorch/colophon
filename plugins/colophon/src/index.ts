/**
 * The Colophon frontend plugin.
 *
 * ```ts
 * // packages/app/src/App.tsx
 * import colophonPlugin from '@brnby/plugin-colophon';
 * ```
 */

export {
  isColophonAvailable,
  isWithinSubpath,
  readAnnotationKey,
  readBundleRef,
} from './annotation';
export type {
  BundleSummary,
  ChannelInfo,
  ColophonApi,
  ResolvedManifest,
  ResolvedPage,
  SearchFilters,
  SearchHit,
  SearchResponse,
} from './api';
export { ColophonClient, colophonApiRef } from './api';
export type { DocsBrowserProps } from './components/DocsBrowser';
export { DocsBrowser } from './components/DocsBrowser';
export type { ColophonReference } from './components/markdownComponents';
export { useColophonReference } from './components/markdownComponents';
export { colophonPlugin as default, colophonRouteRef } from './plugin';
