/**
 * The Colophon publisher.
 *
 * The library surface is exported alongside the CLI so a pipeline that needs
 * something the flags do not cover can call `build` and `upload` directly
 * rather than shelling out.
 */

export { canonicalize } from './canonicalize';
export { CliError, createCli } from './cli';
export { main } from './main';
export { buildNav, reachableSlugs } from './nav';
export type { BuildResult, PublishOptions, UploadStats } from './publish';
export { build, hasErrors, upload } from './publish';
export { registerRevision } from './register';
export type { ScanResult } from './scan';
export { readDocsConfig, scan } from './scan';
export {
  type BundleStorage,
  LocalBundleStorage,
  S3BundleStorage,
} from './storage';
export type { AssetDraft, Diagnostic, PageDraft } from './types';
export { validate } from './validate';
