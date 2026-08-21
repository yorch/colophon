import type { DocStatus, DocType } from '@brnby/colophon-common';

export interface RevisionRecord {
  revisionId: string;
  bundleId: string;
  createdAt: string;
  source: { url: string; ref: string; commit: string };
  title: string;
  description?: string;
  indexedAt?: string;
}

export interface ChannelRecord {
  bundleId: string;
  channel: string;
  revisionId: string;
  updatedAt: string;
  isDefault: boolean;
}

export interface PageRecord {
  slug: string;
  title: string;
  description?: string;
  type?: DocType;
  status: DocStatus;
  tags: string[];
  contentHash: string;
  navOrder?: number;
}

export interface ChunkRecord {
  id: string;
  revisionId: string;
  slug: string;
  anchor?: string;
  breadcrumb: string[];
  text: string;
  ordinal: number;
  contentHash: string;
}

export interface EntityLinkRecord {
  entityRef: string;
  bundleId: string;
  subpath?: string;
}

export interface BundleSummary {
  bundleId: string;
  title: string;
  description?: string;
  defaultChannel?: string;
  channels: ChannelRecord[];
}

export interface ChunkSearchOptions {
  query: string;
  bundleIds?: string[];
  entityRefs?: string[];
  type?: DocType;
  /** All listed tags must be present — this is a filter, not a query term. */
  tags?: string[];
  channel?: string;
  limit: number;
  offset: number;
}

export interface ChunkSearchHit extends ChunkRecord {
  bundleId: string;
  channel: string;
  score: number;
  page: Pick<PageRecord, 'title' | 'description' | 'type' | 'status' | 'tags'>;
}

export interface ChunkSearchResult {
  hits: ChunkSearchHit[];
  /** Total matches before pagination, so callers can be honest about it. */
  total: number;
}
