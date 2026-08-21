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
    .strictObject({
      title: z.string().min(1).optional(),
      page: z.string().min(1).optional(),
      children: z.array(navEntrySpecSchema).optional(),
    })
    .refine(
      v => Boolean(v.page) || Boolean(v.title),
      'a nav entry needs at least a page or a title',
    ),
);

/**
 * Deeper than any real navigation and shallow enough that walking to it costs
 * nothing. The number is a backstop, not a design constraint.
 */
const MAX_NAV_DEPTH = 24;

/**
 * YAML anchors make a self-referential nav easy to write by accident:
 *
 *     nav: &sections
 *       - title: Guides
 *         children: *sections
 *
 * `navEntrySpecSchema` is recursive, so zod would follow that reference until
 * the stack ran out — and "Maximum call stack size exceeded" names neither the
 * file nor the field, which is about the least useful thing a publish can say.
 * The check has to run BEFORE the schema, because once zod has recursed the
 * stack is already gone; hence the pipe below rather than a `.refine` on the
 * parsed value.
 *
 * A cycle is just an infinitely deep tree, so bounding the depth catches both
 * it and the merely absurd — and bounding the walk is what keeps this guard
 * from being the thing that overflows.
 */
function checkNavDepth(value: unknown, depth: number): boolean {
  if (depth > MAX_NAV_DEPTH) {
    return false;
  }
  if (!value || typeof value !== 'object') {
    return true;
  }
  const children = Array.isArray(value)
    ? value
    : ((value as { children?: unknown }).children ?? []);
  if (!Array.isArray(children)) {
    return true;
  }
  return children.every(child => checkNavDepth(child, depth + 1));
}

/**
 * YAML gives `null` for a key written with no value — `nav:` alone on a line,
 * or every entry under it commented out while someone bisects a broken build.
 * That means "not configured", so it has to read the same as the key being
 * absent; failing the publish over a commented-out line is its own small
 * outage.
 */
const absent = (value: unknown) => (value === null ? undefined : value);

export const docsConfigSchema = z.strictObject({
  /** Overrides the bundle title, which otherwise comes from the root page. */
  title: z.preprocess(absent, z.string().min(1).optional()),
  description: z.preprocess(absent, z.string().optional()),
  /** Default doc type for pages that do not declare one. */
  defaultType: z.preprocess(absent, docTypeSchema.optional()),
  /** Explicit navigation. When present it wins over the directory tree. */
  nav: z.preprocess(
    absent,
    z
      .unknown()
      .refine(
        value => checkNavDepth(value, 0),
        `nav is nested more than ${MAX_NAV_DEPTH} levels deep, which usually means a YAML anchor that refers to itself`,
      )
      .pipe(z.array(navEntrySpecSchema))
      .optional(),
  ),
  /** Globs excluded from publication, relative to the docs root. */
  exclude: z.preprocess(absent, z.array(z.string()).default([])),
});
export type DocsConfig = z.infer<typeof docsConfigSchema>;

export const DOCS_CONFIG_FILENAMES = ['docs.yaml', 'docs.yml'] as const;

export function parseDocsConfig(input: unknown): DocsConfig {
  return docsConfigSchema.parse(input);
}
