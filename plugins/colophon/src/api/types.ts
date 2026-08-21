import type {
  BundleSummary,
  ChannelInfo,
  ListBundlesFilters,
  ResolvedManifestResponse,
  ResolvedPage,
  SearchFilters,
  SearchResponse,
} from '@brnby/colophon-common';

export type { SearchHit } from '@brnby/colophon-common';
/**
 * Wire types come from the contract rather than being restated here.
 *
 * Restating them is how the previous declaration came to expect a top-level
 * `title` on a search hit that the backend nests under `page` — undefined at
 * runtime, with both sides type-checking against their own idea of the shape.
 */
export type {
  BundleSummary,
  ChannelInfo,
  ListBundlesFilters,
  ResolvedPage,
  SearchFilters,
  SearchResponse,
};

/** Kept as a local alias; the name reads better at call sites. */
export type ResolvedManifest = ResolvedManifestResponse;

export interface ColophonApi {
  listBundles(filters?: ListBundlesFilters): Promise<BundleSummary[]>;
  getChannels(bundleId: string): Promise<ChannelInfo[]>;
  getManifest(bundleId: string, channel?: string): Promise<ResolvedManifest>;
  getPage(
    bundleId: string,
    slug: string,
    channel?: string,
  ): Promise<ResolvedPage>;
  assetUrl(bundleId: string, path: string, channel?: string): Promise<string>;
  search(query: string, filters?: SearchFilters): Promise<SearchResponse>;
}
