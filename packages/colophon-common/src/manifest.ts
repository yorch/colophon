import { z } from 'zod';
import { bundleIdSchema, contentHashSchema, revisionIdSchema } from './ids';

/**
 * The Colophon manifest is the contract between the publisher CLI, the
 * backend, the frontend, and the MCP tools. Everything else is an
 * implementation detail behind it.
 *
 * Design rule: the manifest is a COMPLETE index of a revision. Titles,
 * descriptions, the nav tree, and every heading anchor live here, so the
 * backend can render navigation, build a table of contents, validate
 * cross-page links, and plan retrieval chunks without fetching a single
 * markdown blob. Only page bodies require a blob read.
 */

/** Diátaxis document type. Cheap to author, and it does triple duty:
 * groups the UI, lets agents filter ("a how-to, not an explainer"), and nudges
 * authors toward one purpose per page — which is what makes heading-level
 * chunks self-contained. */
/**
 * Values, separate from the schema, because a consumer that must build its
 * own zod instance — the MCP actions registry injects one — can still reuse
 * the vocabulary. Hardcoding the list there meant adding a fifth type would
 * leave the agent surface silently rejecting it.
 */
export const DOC_TYPES = [
  'tutorial',
  'how-to',
  'reference',
  'explanation',
] as const;

export const docTypeSchema = z.enum(DOC_TYPES);
export type DocType = z.infer<typeof docTypeSchema>;

export const DOC_STATUSES = ['current', 'draft', 'deprecated'] as const;

export const docStatusSchema = z.enum(DOC_STATUSES);
export type DocStatus = z.infer<typeof docStatusSchema>;

/** A heading within a page. `anchor` is the slugified id used for deep links,
 * and is the unit retrieval chunks are cut on. */
export const headingSchema = z.object({
  depth: z.number().int().min(1).max(6),
  text: z.string(),
  anchor: z.string(),
});
export type Heading = z.infer<typeof headingSchema>;

export const pageSchema = z.object({
  /** Path relative to the docs root, e.g. `guides/deploy.md`. */
  path: z.string().min(1),
  /** URL-facing identity, derived via `slugFromPath`. */
  slug: z.string(),
  title: z.string().min(1),
  /** What an agent sees in a search result before deciding to fetch the page.
   * Weak descriptions are the single biggest cause of poor retrieval. */
  description: z.string().optional(),
  type: docTypeSchema.optional(),
  status: docStatusSchema.default('current'),
  tags: z.array(z.string()).default([]),
  navOrder: z.number().int().optional(),
  headings: z.array(headingSchema).default([]),
  contentHash: contentHashSchema,
  size: z.number().int().nonnegative(),
});
export type Page = z.infer<typeof pageSchema>;

/**
 * A node in the navigation tree. A node without a `slug` is a group header
 * that has no page of its own.
 */
export interface NavNode {
  title: string;
  slug?: string;
  children?: NavNode[];
}

export const navNodeSchema: z.ZodType<NavNode> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    slug: z.string().optional(),
    children: z.array(navNodeSchema).optional(),
  }),
);

export const assetSchema = z.object({
  path: z.string().min(1),
  contentHash: contentHashSchema,
  size: z.number().int().nonnegative(),
  mediaType: z.string().min(1),
});
export type Asset = z.infer<typeof assetSchema>;

export const sourceSchema = z.object({
  type: z.literal('git'),
  /** Repository URL, used to build "edit this page" links. */
  url: z.string(),
  /** Branch or tag the revision was built from. */
  ref: z.string(),
  commit: z.string(),
  /** Path to the docs directory within the repository. */
  path: z.string().default('docs'),
});
export type Source = z.infer<typeof sourceSchema>;

export const publisherSchema = z.object({
  /** Free-form identity of whoever published, e.g. `github-actions`. */
  name: z.string(),
  /** Link back to the CI run that produced the revision. */
  runUrl: z.string().optional(),
  toolVersion: z.string().optional(),
});
export type Publisher = z.infer<typeof publisherSchema>;

/**
 * Note what is deliberately ABSENT: the channel. A manifest describes content;
 * a channel is routing. Channel assignment happens at publish time and is
 * recorded in the database, which keeps revisions genuinely immutable and lets
 * a rollback be a pointer move rather than a rebuild.
 */
export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  bundleId: bundleIdSchema,
  revisionId: revisionIdSchema,
  /**
   * Canonical UTC with a trailing Z. Keeps timestamps lexicographically
   * sortable and free of offset ambiguity; publishers must convert.
   */
  createdAt: z.iso.datetime(),
  source: sourceSchema,
  publisher: publisherSchema.optional(),
  /** Human-facing name for the bundle as a whole. */
  title: z.string().min(1),
  description: z.string().optional(),
  pages: z.array(pageSchema),
  nav: z.array(navNodeSchema),
  assets: z.array(assetSchema).default([]),
});
export type Manifest = z.infer<typeof manifestSchema>;

/** The current manifest schema version. Bump only for breaking changes; the
 * backend is expected to keep reading older versions it has stored. */
export const MANIFEST_SCHEMA_VERSION = 1 as const;

export const MANIFEST_FILENAME = 'manifest.json';

export function parseManifest(input: unknown): Manifest {
  return manifestSchema.parse(input);
}
