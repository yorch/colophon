import { z } from 'zod';

/**
 * Chunking parameters.
 *
 * Backend-only, deliberately. Chunking runs at index time precisely so the
 * strategy can evolve without every repository re-running its CI, and these
 * values are read from Backstage config — so they belong to the deployment,
 * not to the bundle contract the publisher and the frontend share.
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
