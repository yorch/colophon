import { z } from 'zod';
import { bundleIdSchema, contentHashSchema, revisionIdSchema } from './ids';

/**
 * Retrieval chunks are what agents actually receive from `colophon:search`.
 *
 * The SHAPE lives here because it crosses the wire. The chunking PARAMETERS
 * do not, and are in plugins/colophon-backend/src/indexing/options.ts: the
 * whole point of chunking at index time is that the strategy can change
 * without any repository re-running CI, and a tuning knob in this package
 * would make raising maxChars a version bump of the contract the publisher
 * depends on. That is the opposite of the constraint it exists to satisfy.
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
