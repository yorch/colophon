import { pageUrl } from '../service/links';
import type { ColophonActionDeps } from './types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * The orientation action. Without it an agent has to guess whether a
 * component has docs at all, which usually means a wasted search.
 */
export function registerListEntitiesAction(deps: ColophonActionDeps): void {
  deps.actionsRegistry.register({
    name: 'list-entities',
    title: 'List entities with documentation',
    description: [
      'List the catalog entities that have Colophon documentation, with the',
      'bundle each one points at. Use this to find out whether a component',
      'has docs before searching, or to discover what documentation exists.',
    ].join(' '),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z =>
        z.object({
          bundleId: z
            .string()
            .optional()
            .describe('Only entities pointing at this bundle.'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_LIMIT)
            .optional()
            .describe(
              `Results per page, 1-${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`,
            ),
          offset: z.number().int().min(0).optional(),
        }),
      output: z =>
        z.object({
          entities: z.array(
            z.object({
              entityRef: z.string(),
              bundleId: z.string(),
              subpath: z
                .string()
                .optional()
                .describe(
                  'Set when several entities share one monorepo bundle.',
                ),
              title: z.string(),
              description: z.string().optional(),
              defaultChannel: z.string().optional(),
              channels: z.array(z.string()),
              url: z.string(),
            }),
          ),
          total: z.number(),
          returned: z.number(),
          remaining: z.number(),
          nextOffset: z.number().optional(),
          note: z.string(),
        }),
    },
    action: async ({ input, credentials }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? 0;
      const links = await deps.colophon.db.listEntityLinks({
        bundleIds: input.bundleId ? [input.bundleId] : undefined,
      });
      // Filter BEFORE paginating, or the page size would leak how many
      // entries were withheld.
      const readable = await deps.authorizer.filterReadable(
        [...new Set(links.map(link => link.bundleId))],
        credentials,
      );
      const all = links.filter(link => readable.has(link.bundleId));
      const page = all.slice(offset, offset + limit);
      const bundles = new Map(
        (
          await deps.colophon.db.listBundles({
            bundleIds: [...new Set(page.map(link => link.bundleId))],
          })
        ).map(bundle => [bundle.bundleId, bundle]),
      );
      const remaining = Math.max(0, all.length - (offset + page.length));

      return {
        output: {
          entities: page.map(link => {
            const bundle = bundles.get(link.bundleId);
            return {
              entityRef: link.entityRef,
              bundleId: link.bundleId,
              subpath: link.subpath,
              title: bundle?.title ?? link.bundleId,
              description: bundle?.description,
              defaultChannel: bundle?.defaultChannel,
              channels: bundle?.channels.map(c => c.channel) ?? [],
              url: pageUrl({
                appBaseUrl: deps.appBaseUrl,
                bundleId: link.bundleId,
                slug: link.subpath ?? '',
                entityRef: link.entityRef,
              }),
            };
          }),
          total: all.length,
          returned: page.length,
          remaining,
          nextOffset: remaining > 0 ? offset + page.length : undefined,
          note:
            remaining > 0
              ? `Showing ${page.length} of ${all.length} entities. ${remaining} ` +
                `more — re-run with offset ${offset + page.length}.`
              : `Showing all ${all.length} entities.`,
        },
      };
    },
  });
}
