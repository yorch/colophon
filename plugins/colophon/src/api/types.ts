import type { Chunk, DocType, Manifest } from '@brnby/colophon-common';

export interface ChannelInfo {
  bundleId: string;
  channel: string;
  revisionId: string;
  updatedAt: string;
  isDefault: boolean;
}

export interface BundleSummary {
  bundleId: string;
  title: string;
  description?: string;
  defaultChannel?: string;
  channels: ChannelInfo[];
}

/** A manifest together with the channel it was resolved through. */
export interface ResolvedManifest {
  bundleId: string;
  channel: string;
  revisionId: string;
  isDefault: boolean;
  updatedAt: string;
  manifest: Manifest;
}

export interface ResolvedPage {
  markdown: string;
  revisionId: string;
  channel: string;
}

export interface SearchHit extends Omit<Chunk, 'contentHash'> {
  title: string;
  score: number;
}

export interface SearchResponse {
  results: SearchHit[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchFilters {
  bundleId?: string[];
  entityRef?: string[];
  tag?: string[];
  type?: DocType;
  channel?: string;
  limit?: number;
  offset?: number;
}

export interface ColophonApi {
  listBundles(filters?: {
    bundleId?: string[];
    entityRef?: string[];
    q?: string;
  }): Promise<BundleSummary[]>;
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
