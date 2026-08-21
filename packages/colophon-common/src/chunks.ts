import { z } from 'zod';
import { bundleIdSchema, contentHashSchema, revisionIdSchema } from './ids';

/**
 * Retrieval chunks are what agents actually receive from `colophon:search`.
 *
 * Chunking deliberately happens in the BACKEND at index time, not in the CLI
 * at publish time. Strategy will evolve as we learn what agents retrieve well,
 * and re-chunking must not require every repository to re-run its CI. The
 * published bundle therefore carries pages and headings; the backend derives
 * chunks from them.
 */

export const chunkSchema = z.object({
  bundleId: bundleIdSchema,
  revisionId: revisionIdSchema,
  /** Page this chunk was cut from. */
  slug: z.string(),
  /** Heading anchor for a deep link, absent for a page's preamble. */
  anchor: z.string().optional(),
  /**
   * Heading trail from page title down to this chunk's own heading, e.g.
   * ["Payments API", "Operations", "Rotating credentials"]. Prepended to the
   * chunk text at retrieval time so a chunk read in isolation still says what
   * it is about — the single cheapest defence against context-free chunks.
   */
  breadcrumb: z.array(z.string()),
  text: z.string(),
  /** Position within the page, so adjacent chunks can be fetched for context. */
  ordinal: z.number().int().nonnegative(),
  contentHash: contentHashSchema,
});
export type Chunk = z.infer<typeof chunkSchema>;

/**
 * Chunking parameters.
 *
 * Splitting on H2/H3 rather than H2 alone matters because reference pages put
 * one endpoint or one option per H3; splitting only on H2 would glue thirty
 * unrelated options into a single chunk and destroy precision. The size
 * ceiling then catches prose sections that run long, and the floor merges
 * heading stubs that carry no content of their own.
 */
export const chunkingOptionsSchema = z.object({
  /** Heading depths that start a new chunk. */
  splitDepths: z.array(z.number().int().min(1).max(6)).default([2, 3]),
  /** Soft ceiling in characters; longer sections are split on paragraphs. */
  maxChars: z.number().int().positive().default(1500),
  /** Sections shorter than this merge into the following sibling. */
  minChars: z.number().int().nonnegative().default(200),
  /** Characters of the preceding chunk repeated for continuity. */
  overlapChars: z.number().int().nonnegative().default(0),
});
export type ChunkingOptions = z.infer<typeof chunkingOptionsSchema>;

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions =
  chunkingOptionsSchema.parse({});
