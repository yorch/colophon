import type { DocStatus, DocType, Manifest, Page } from './manifest';

/**
 * The HTTP surface between the backend and its clients.
 *
 * These are as much wire format as the manifest is, and they were previously
 * declared twice — once by the server that sends them and once by the client
 * that reads them. The two had already drifted: the client expected a
 * top-level `title` on a search hit that the server has never sent, so
 * `hit.title` was undefined at runtime and nothing said so, because each side
 * type-checked happily against its own declaration.
 *
 * Declaring them here makes a divergence a compile error in whichever package
 * stops matching.
 */

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

export interface ListBundlesResponse {
  bundles: BundleSummary[];
}

export interface ListChannelsResponse {
  channels: ChannelInfo[];
}

/** A manifest together with the channel it was resolved through. */
export interface ResolvedManifestResponse {
  bundleId: string;
  channel: string;
  revisionId: string;
  isDefault: boolean;
  updatedAt: string;
  manifest: Manifest;
}

/**
 * A page body, as Markdown.
 *
 * Pages are served as `text/markdown` rather than wrapped in JSON — keeping
 * the wire format identical to the stored format is the point of the design —
 * so the revision and channel arrive as `x-colophon-revision` and
 * `x-colophon-channel` headers.
 */
export interface ResolvedPage {
  markdown: string;
  revisionId: string;
  channel: string;
}

/**
 * One search result.
 *
 * A CHUNK, not a page: a section of a page, with the heading trail it sits
 * under. Page-level metadata is nested under `page` rather than flattened,
 * so it is obvious which fields describe the section and which describe the
 * document it came from.
 */
export interface SearchHit {
  id: string;
  revisionId: string;
  bundleId: string;
  channel: string;
  slug: string;
  anchor?: string;
  /** Page title, then the heading trail down to this section. */
  breadcrumb: string[];
  text: string;
  ordinal: number;
  score: number;
  page: Pick<Page, 'title' | 'description' | 'type' | 'status' | 'tags'>;
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

export interface ListBundlesFilters {
  bundleId?: string[];
  entityRef?: string[];
  q?: string;
}

/** Re-exported so a client needs only this module to type a response. */
export type { DocStatus, DocType };
