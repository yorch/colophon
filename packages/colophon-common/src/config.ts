import { z } from 'zod';
import { docTypeSchema } from './manifest';

/**
 * `docs.yaml` — the optional escape hatch at the root of a docs directory.
 *
 * Optional is the point. Requiring an explicit nav file is the single biggest
 * onboarding tax in MkDocs, so the directory tree plus frontmatter is always a
 * sufficient source of navigation. This file exists for the cases conventions
 * cannot express: ordering that is not alphabetical, group headers with no
 * page of their own, and pages deliberately hidden from the nav.
 */

export interface NavEntrySpec {
  title?: string;
  /** Path relative to the docs root, e.g. `guides/deploy.md`. */
  page?: string;
  children?: NavEntrySpec[];
}

export const navEntrySpecSchema: z.ZodType<NavEntrySpec> = z.lazy(() =>
  z
    .object({
      title: z.string().min(1).optional(),
      page: z.string().min(1).optional(),
      children: z.array(navEntrySpecSchema).optional(),
    })
    .refine(
      v => Boolean(v.page) || Boolean(v.title),
      'a nav entry needs at least a page or a title',
    ),
);

export const docsConfigSchema = z.object({
  /** Overrides the bundle title, which otherwise comes from the root page. */
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  /** Default doc type for pages that do not declare one. */
  defaultType: docTypeSchema.optional(),
  /** Explicit navigation. When present it wins over the directory tree. */
  nav: z.array(navEntrySpecSchema).optional(),
  /** Globs excluded from publication, relative to the docs root. */
  exclude: z.array(z.string()).default([]),
});
export type DocsConfig = z.infer<typeof docsConfigSchema>;

export const DOCS_CONFIG_FILENAMES = ['docs.yaml', 'docs.yml'] as const;

export function parseDocsConfig(input: unknown): DocsConfig {
  return docsConfigSchema.parse(input);
}
