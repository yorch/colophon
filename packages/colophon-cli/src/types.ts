import type { DocStatus, DocType, Heading } from '@brnby/colophon-common';

/** A link or image target found in a page's markdown, before it is resolved
 * against the rest of the bundle. */
export interface Reference {
  url: string;
  kind: 'link' | 'image';
}

/**
 * A page as scanned from disk, before cross-page validation.
 *
 * `rawBytes` is the exact file content, frontmatter included — that is what
 * gets uploaded as the page's blob, because the backend's chunker strips
 * frontmatter itself when it reads a blob back (see
 * plugins/colophon-backend/src/indexing/chunker.ts). `body` is the same
 * content with frontmatter already removed, used for parsing headings and
 * links so YAML never gets mistaken for markdown.
 */
export interface PageDraft {
  path: string;
  slug: string;
  title: string;
  description?: string;
  type?: DocType;
  status: DocStatus;
  tags: string[];
  navOrder?: number;
  headings: Heading[];
  references: Reference[];
  rawBytes: Buffer;
  body: string;
}

export interface AssetDraft {
  path: string;
  mediaType: string;
  bytes: Buffer;
}

export type DiagnosticLevel = 'error' | 'warning';

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  path?: string;
}
