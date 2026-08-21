import type { NavNode } from '@brnby/colophon-common';
import { pageUrl } from '../service/links';
import { type BundleTarget, inScope, resolveTarget } from './targets';
import { CHANNEL_HINT, type ColophonActionDeps, TARGET_HINT } from './types';

/** Keeps nodes inside the target's scope, and groups that still have children. */
function scopeNav(nodes: NavNode[], target: BundleTarget): NavNode[] {
  const kept: NavNode[] = [];
  for (const node of nodes) {
    const children = node.children ? scopeNav(node.children, target) : [];
    const selfInScope = node.slug !== undefined && inScope(target, node.slug);
    if (!selfInScope && children.length === 0) {
      continue;
    }
    kept.push({
      title: node.title,
      slug: selfInScope ? node.slug : undefined,
      ...(children.length > 0 ? { children } : {}),
    });
  }
  return kept;
}

/**
 * A recursive tree is rendered to an indented outline rather than returned as
 * nested objects. Agents read it in one glance, it survives JSON-schema
 * conversion without a self-referential $ref, and it costs a fraction of the
 * tokens a nested structure would.
 */
function renderOutline(nodes: NavNode[], depth = 0): string[] {
  return nodes.flatMap(node => [
    `${'  '.repeat(depth)}- ${node.title}${
      node.slug !== undefined ? ` (slug: "${node.slug}")` : ''
    }`,
    ...renderOutline(node.children ?? [], depth + 1),
  ]);
}

export function registerListPagesAction(deps: ColophonActionDeps): void {
  deps.actionsRegistry.register({
    name: 'list-pages',
    title: 'List documentation pages',
    description: [
      'Show the navigation tree and page index for a set of documentation.',
      'Call this FIRST when you do not yet know what documentation exists —',
      'it is far cheaper than guessing at search terms, and the slugs it',
      'returns are what colophon:get-page expects.',
      TARGET_HINT,
    ].join(' '),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z =>
        z.object({
          entityRef: z
            .string()
            .optional()
            .describe('Catalog entity whose docs to list.'),
          bundleId: z.string().optional().describe('Documentation bundle id.'),
          channel: z.string().optional().describe(CHANNEL_HINT),
        }),
      output: z =>
        z.object({
          bundleId: z.string(),
          entityRef: z.string().optional(),
          revisionId: z.string(),
          channel: z.string(),
          title: z.string(),
          description: z.string().optional(),
          outline: z
            .string()
            .describe('The navigation tree as an indented Markdown list.'),
          pages: z.array(
            z.object({
              slug: z.string(),
              title: z.string(),
              description: z.string().optional(),
              type: z.string().optional(),
              status: z.string(),
              tags: z.array(z.string()),
              url: z.string(),
            }),
          ),
          totalPages: z.number(),
        }),
    },
    action: async ({ input }) => {
      const target = await resolveTarget(deps.colophon.db, input);
      const { channel, manifest } = await deps.colophon.getManifest(
        target.bundleId,
        input.channel,
      );
      const pages = manifest.pages.filter(page => inScope(target, page.slug));
      const nav = scopeNav(manifest.nav, target);

      return {
        output: {
          bundleId: target.bundleId,
          entityRef: target.entityRef,
          revisionId: channel.revisionId,
          channel: channel.channel,
          title: manifest.title,
          description: manifest.description,
          outline: renderOutline(nav).join('\n'),
          pages: pages.map(page => ({
            slug: page.slug,
            title: page.title,
            description: page.description,
            type: page.type,
            status: page.status,
            tags: page.tags,
            url: pageUrl({
              appBaseUrl: deps.appBaseUrl,
              bundleId: target.bundleId,
              slug: page.slug,
              channel: channel.channel,
              entityRef: target.entityRef,
            }),
          })),
          totalPages: pages.length,
        },
      };
    },
  });
}
