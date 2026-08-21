import { DOC_TYPES } from '@brnby/colophon-common';
import { MAX_SEARCH_LIMIT } from '../service/ColophonService';
import { pageUrl } from '../service/links';
import { linkForSlug } from './targets';
import { CHANNEL_HINT, type ColophonActionDeps } from './types';

const DEFAULT_LIMIT = 8;

/**
 * The action an agent reaches for first, so its description carries the most
 * weight: it has to say what a "chunk" is, why the breadcrumb is there, and
 * that the results are citable — a model choosing between this and a generic
 * web search decides on these few sentences alone.
 */
export function registerSearchAction(deps: ColophonActionDeps): void {
  deps.actionsRegistry.register({
    name: 'search',
    title: 'Search documentation',
    description: [
      'Full-text search across documentation published to the Backstage',
      'catalog. Returns ranked SECTIONS of pages — not whole pages — each with',
      'the heading trail it sits under and a portal URL you can cite.',
      'Start here when you need to find something; use colophon:get-page',
      'afterwards to read a whole page. Narrow with entityRefs when the',
      'question is about a specific component or system.',
    ].join(' '),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z =>
        z.object({
          query: z
            .string()
            .min(1)
            .describe(
              'Natural-language or keyword query, e.g. "rotate api credentials".',
            ),
          entityRefs: z
            .array(z.string())
            .optional()
            .describe(
              'Restrict to docs owned by these catalog entities, e.g. ' +
                '["component:default/payments-api"].',
            ),
          bundleIds: z
            .array(z.string())
            .optional()
            .describe('Restrict to these documentation bundles.'),
          type: z
            .enum(DOC_TYPES)
            .optional()
            .describe(
              'Restrict by Diataxis document type — "how-to" for procedures, ' +
                '"reference" for lookup tables, "explanation" for background.',
            ),
          tags: z
            .array(z.string())
            .optional()
            .describe('Only pages carrying ALL of these tags.'),
          channel: z.string().optional().describe(CHANNEL_HINT),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_SEARCH_LIMIT)
            .optional()
            .describe(
              `Results per page, 1-${MAX_SEARCH_LIMIT}. Default ${DEFAULT_LIMIT}.`,
            ),
          offset: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Results to skip. Use the nextOffset from a prior call.'),
        }),
      output: z =>
        z.object({
          results: z.array(
            z.object({
              heading: z
                .string()
                .describe('The heading this section sits under.'),
              breadcrumb: z
                .array(z.string())
                .describe(
                  'Page title, then the heading trail down to this section.',
                ),
              text: z.string().describe('The section content, as Markdown.'),
              bundleId: z.string(),
              entityRef: z.string().optional(),
              slug: z
                .string()
                .describe(
                  'Page slug; pass to colophon:get-page to read it all.',
                ),
              anchor: z.string().optional(),
              pageTitle: z.string(),
              pageDescription: z.string().optional(),
              type: z.string().optional(),
              status: z.string(),
              tags: z.array(z.string()),
              channel: z.string(),
              url: z.string().describe('Portal deep link — cite this.'),
              score: z.number(),
            }),
          ),
          total: z.number().describe('Total matches before pagination.'),
          returned: z.number(),
          remaining: z.number().describe('Matches not shown by this call.'),
          nextOffset: z
            .number()
            .optional()
            .describe(
              'Pass as offset to fetch the next page. Absent when done.',
            ),
          note: z.string(),
        }),
    },
    action: async ({ input, credentials }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? 0;
      const { hits: allHits, total: matched } = await deps.colophon.search({
        query: input.query,
        entityRefs: input.entityRefs,
        bundleIds: input.bundleIds,
        type: input.type,
        tags: input.tags,
        channel: input.channel,
        limit,
        offset,
      });
      // Filtered rather than refused: a search must omit what the caller
      // cannot see, not fail because one result is out of reach.
      const readable = await deps.authorizer.filterReadable(
        [...new Set(allHits.map(hit => hit.bundleId))],
        credentials,
      );
      const hits = allHits.filter(hit => readable.has(hit.bundleId));
      // Counts describe what this caller may see. Reporting the unfiltered
      // total would tell an agent how much was withheld.
      const total = hits.length === allHits.length ? matched : hits.length;

      const links = await deps.colophon.db.listEntityLinks({
        bundleIds: [...new Set(hits.map(hit => hit.bundleId))],
      });
      const remaining = Math.max(0, total - (offset + hits.length));

      return {
        output: {
          results: hits.map(hit => {
            const link = linkForSlug(links, hit.bundleId, hit.slug);
            return {
              heading:
                hit.breadcrumb[hit.breadcrumb.length - 1] ?? hit.page.title,
              breadcrumb: hit.breadcrumb,
              text: hit.text,
              bundleId: hit.bundleId,
              entityRef: link?.entityRef,
              slug: hit.slug,
              anchor: hit.anchor,
              pageTitle: hit.page.title,
              pageDescription: hit.page.description,
              type: hit.page.type,
              status: hit.page.status,
              tags: hit.page.tags,
              channel: hit.channel,
              url: pageUrl({
                appBaseUrl: deps.appBaseUrl,
                bundleId: hit.bundleId,
                slug: hit.slug,
                channel: hit.channel,
                anchor: hit.anchor,
                entityRef: link?.entityRef,
              }),
              score: hit.score,
            };
          }),
          total,
          returned: hits.length,
          remaining,
          // Truncation is stated, never silent: an agent that does not know
          // results were cut will confidently answer from a third of them.
          nextOffset: remaining > 0 ? offset + hits.length : undefined,
          note:
            remaining > 0
              ? `Showing ${hits.length} of ${total} matches. ${remaining} more — ` +
                `re-run with offset ${offset + hits.length}.`
              : `Showing all ${total} matches.`,
        },
      };
    },
  });
}
