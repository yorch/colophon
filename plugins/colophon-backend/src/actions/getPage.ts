import { NotFoundError } from '@backstage/errors';
import { normalizeSlug } from '@brnby/colophon-common';
import { pageUrl } from '../service/links';
import { inScope, resolveTarget } from './targets';
import { CHANNEL_HINT, type ColophonActionDeps, TARGET_HINT } from './types';

/**
 * Returns Markdown, never HTML. That is the whole reason this plugin stores
 * Markdown as its canonical artifact — an agent asked to reason about a table
 * or a code sample should not have to unpick a rendered DOM first.
 */
export function registerGetPageAction(deps: ColophonActionDeps): void {
  deps.actionsRegistry.register({
    name: 'get-page',
    title: 'Read a documentation page',
    description: [
      'Read one documentation page in full, as raw Markdown.',
      'Use after colophon:search returns a promising slug, or after',
      'colophon:list-pages shows you the navigation.',
      'Pass an anchor to get just that section instead of the whole page.',
      TARGET_HINT,
    ].join(' '),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z =>
        z.object({
          entityRef: z
            .string()
            .optional()
            .describe('Catalog entity whose docs to read.'),
          bundleId: z.string().optional().describe('Documentation bundle id.'),
          slug: z
            .string()
            .describe(
              'Page slug as returned by search or list-pages, e.g. ' +
                '"guides/deploy". Use "" for the landing page.',
            ),
          anchor: z
            .string()
            .optional()
            .describe(
              'Heading anchor, e.g. "rotating-credentials". Returns only that ' +
                'section — much cheaper than the whole page.',
            ),
          channel: z.string().optional().describe(CHANNEL_HINT),
        }),
      output: z =>
        z.object({
          bundleId: z.string(),
          entityRef: z.string().optional(),
          revisionId: z.string(),
          channel: z.string(),
          slug: z.string(),
          title: z.string(),
          description: z.string().optional(),
          type: z.string().optional(),
          status: z
            .string()
            .describe(
              '"draft" and "deprecated" pages must be flagged to the user.',
            ),
          tags: z.array(z.string()),
          markdown: z.string().describe('The page body, as authored.'),
          partial: z
            .boolean()
            .describe('True when an anchor narrowed this to one section.'),
          url: z.string().describe('Portal deep link — cite this.'),
        }),
    },
    action: async ({ input, credentials }) => {
      const target = await resolveTarget(deps.colophon.db, input);
      // Actions run as the CALLING USER, so this must apply the same
      // check the HTTP route does — an agent must not reach documentation
      // its operator cannot.
      await deps.authorizer.assertCanRead(target.bundleId, credentials);
      const slug = normalizeSlug(input.slug);
      if (!inScope(target, slug)) {
        throw new NotFoundError(
          `Page "${slug}" is outside the documentation scoped to ` +
            `"${target.entityRef ?? target.bundleId}"`,
        );
      }

      const resolved = await deps.colophon.getPage(
        target.bundleId,
        slug,
        input.channel,
      );

      let markdown = resolved.markdown;
      let partial = false;
      if (input.anchor) {
        const sections = (
          await deps.colophon.db.listChunks(resolved.channel.revisionId, slug)
        ).filter(chunk => chunk.anchor === input.anchor);
        if (sections.length === 0) {
          throw new NotFoundError(
            `Page "${slug}" has no section anchored at "${input.anchor}"`,
          );
        }
        markdown = sections.map(section => section.text).join('\n\n');
        partial = true;
      }

      return {
        output: {
          bundleId: target.bundleId,
          entityRef: target.entityRef,
          revisionId: resolved.channel.revisionId,
          channel: resolved.channel.channel,
          slug,
          title: resolved.page.title,
          description: resolved.page.description,
          type: resolved.page.type,
          status: resolved.page.status,
          tags: resolved.page.tags,
          markdown,
          partial,
          url: pageUrl({
            appBaseUrl: deps.appBaseUrl,
            bundleId: target.bundleId,
            slug,
            channel: resolved.channel.channel,
            anchor: input.anchor,
            entityRef: target.entityRef,
          }),
        },
      };
    },
  });
}
