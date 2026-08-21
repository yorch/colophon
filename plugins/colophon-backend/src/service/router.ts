import type {
  HttpAuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import {
  bundleIdSchema,
  channelSchema,
  docTypeSchema,
  normalizeSlug,
  revisionIdSchema,
} from '@brnby/colophon-common';
import express, { type Request } from 'express';
import Router from 'express-promise-router';
import { z } from 'zod';
import { type ColophonService, MAX_SEARCH_LIMIT } from './ColophonService';

/** Query strings arrive as string, string[] or undefined — normalise once. */
const listParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(value => {
    if (value === undefined) {
      return undefined;
    }
    const values = (Array.isArray(value) ? value : [value])
      .flatMap(entry => entry.split(','))
      .map(entry => entry.trim())
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  });

const channelQuery = z.object({ channel: channelSchema.optional() });

const listBundlesQuery = z.object({
  bundleId: listParam,
  entityRef: listParam,
  q: z.string().optional(),
});

const registerRevisionBody = z.object({
  revisionId: revisionIdSchema,
  channel: channelSchema.optional(),
  isDefault: z.boolean().optional(),
});

/**
 * Express types `req.params` from the route pattern, which does not include
 * the positional `0` a trailing wildcard produces. Reading it through this
 * helper keeps the cast in one place instead of at every wildcard route.
 */
function wildcardParam(req: Request): string | undefined {
  return (req.params as Record<string, string | undefined>)[0];
}

const indexableQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const searchQuery = z.object({
  q: z.string().min(1, 'a query is required'),
  bundleId: listParam,
  entityRef: listParam,
  tag: listParam,
  type: docTypeSchema.optional(),
  channel: channelSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new InputError(z.prettifyError(result.error));
  }
  return result.data;
}

export async function createRouter(options: {
  colophon: ColophonService;
  httpAuth: HttpAuthService;
  logger: LoggerService;
  appBaseUrl: string;
}): Promise<express.Router> {
  const { colophon, httpAuth } = options;
  const router = Router();
  router.use(express.json());

  router.get('/bundles', async (req, res) => {
    await httpAuth.credentials(req);
    const query = parse(listBundlesQuery, req.query);
    let bundleIds = query.bundleId;
    if (query.entityRef) {
      const links = await colophon.db.listEntityLinks({
        entityRefs: query.entityRef,
      });
      const linked = links.map(link => link.bundleId);
      // Intersect rather than union: both filters narrow.
      bundleIds = bundleIds
        ? bundleIds.filter(id => linked.includes(id))
        : linked;
      if (bundleIds.length === 0) {
        res.json({ bundles: [] });
        return;
      }
    }
    const bundles = await colophon.db.listBundles({
      bundleIds,
      query: query.q,
    });
    res.json({ bundles });
  });

  router.get('/bundles/:bundleId/channels', async (req, res) => {
    await httpAuth.credentials(req);
    const bundleId = parse(bundleIdSchema, req.params.bundleId);
    // Resolving first turns an unknown bundle into a 404 rather than an
    // empty list that looks like a bundle with no channels.
    await colophon.resolve(bundleId);
    res.json({ channels: await colophon.db.listChannels(bundleId) });
  });

  router.get('/bundles/:bundleId/manifest', async (req, res) => {
    await httpAuth.credentials(req);
    const bundleId = parse(bundleIdSchema, req.params.bundleId);
    const { channel } = parse(channelQuery, req.query);
    const resolved = await colophon.getManifest(bundleId, channel);
    res.json({
      bundleId,
      channel: resolved.channel.channel,
      revisionId: resolved.channel.revisionId,
      isDefault: resolved.channel.isDefault,
      updatedAt: resolved.channel.updatedAt,
      manifest: resolved.manifest,
    });
  });

  const readPage: express.RequestHandler = async (req, res) => {
    await httpAuth.credentials(req);
    const bundleId = parse(bundleIdSchema, req.params.bundleId);
    const { channel } = parse(channelQuery, req.query);
    const slug = normalizeSlug(wildcardParam(req) ?? '');
    const resolved = await colophon.getPage(bundleId, slug, channel);
    res
      .status(200)
      .setHeader('content-type', 'text/markdown; charset=utf-8')
      .setHeader('x-colophon-revision', resolved.channel.revisionId)
      .setHeader('x-colophon-channel', resolved.channel.channel)
      .send(resolved.markdown);
  };
  // The bundle landing page has the empty slug, so both shapes must route.
  router.get('/bundles/:bundleId/pages', readPage);
  router.get('/bundles/:bundleId/pages/*', readPage);

  router.get('/bundles/:bundleId/assets/*', async (req, res) => {
    await httpAuth.credentials(req);
    const bundleId = parse(bundleIdSchema, req.params.bundleId);
    const { channel } = parse(channelQuery, req.query);
    const path = parse(z.string().min(1), wildcardParam(req));
    const asset = await colophon.getAsset(bundleId, path, channel);
    res.status(200).setHeader('content-type', asset.mediaType).send(asset.body);
  });

  router.post('/bundles/:bundleId/revisions', async (req, res) => {
    // Publishing is a write, so an unauthenticated caller must not reach it
    // even if a deployment has relaxed the plugin-wide policy.
    await httpAuth.credentials(req, { allow: ['user', 'service'] });
    const bundleId = parse(bundleIdSchema, req.params.bundleId);
    const body = parse(registerRevisionBody, req.body);
    const result = await colophon.registerRevision({ bundleId, ...body });
    res.status(201).json({
      bundleId,
      channel: result.channel,
      indexed: result.ingest.indexed,
      chunkCount: result.ingest.chunkCount,
    });
  });

  /**
   * Everything the search collator needs, paginated.
   *
   * Exists because a Backstage plugin's database is private to that plugin —
   * the search module runs under the `search` plugin id and so cannot read
   * colophon's tables. Cross-plugin reads go over HTTP, which is also how
   * TechDocs' own collator reaches its data.
   */
  router.get('/indexable', async (req, res) => {
    // Service credentials only: this is an internal projection of the whole
    // corpus, not something a browser should be able to page through.
    await httpAuth.credentials(req, { allow: ['service'] });
    const { offset, limit } = parse(indexableQuery, req.query);
    const { rows, total } = await colophon.db.listIndexableChunks({
      offset,
      limit,
    });
    // Entity links travel with the projection rather than being joined into
    // it: a bundle can carry several (a root one plus one per component in a
    // monorepo), and joining would emit the same chunk once per matching
    // link. The table is one row per annotated entity, so sending it whole
    // is cheaper than any of the alternatives.
    const links = await colophon.db.listEntityLinks();
    res.json({ rows, total, offset, limit, links });
  });

  router.get('/search', async (req, res) => {
    await httpAuth.credentials(req);
    const query = parse(searchQuery, req.query);
    const { hits, total } = await colophon.search({
      query: query.q,
      bundleIds: query.bundleId,
      entityRefs: query.entityRef,
      tags: query.tag,
      type: query.type,
      channel: query.channel,
      limit: query.limit,
      offset: query.offset,
    });
    res.json({
      results: hits,
      total,
      limit: query.limit,
      offset: query.offset,
    });
  });

  return router;
}
