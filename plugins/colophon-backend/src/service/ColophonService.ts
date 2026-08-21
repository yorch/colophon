import type { LoggerService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import {
  blobKey,
  type ChunkingOptions,
  DEFAULT_CHANNEL,
  type Manifest,
  manifestKey,
  parseManifest,
} from '@brnby/colophon-common';
import type {
  ChannelRecord,
  ChunkRecord,
  ChunkSearchOptions,
  ChunkSearchResult,
  ColophonDatabase,
  PageRecord,
} from '../database';
import { chunkPage } from '../indexing/chunker';
import type { BundleStorage } from '../storage';

export interface ColophonServiceOptions {
  db: ColophonDatabase;
  storage: BundleStorage;
  logger: LoggerService;
  chunking: ChunkingOptions;
  retention: { revisionsPerChannel: number };
}

export interface IngestResult {
  revisionId: string;
  indexed: boolean;
  chunkCount: number;
}

export interface ResolvedPage {
  channel: ChannelRecord;
  page: PageRecord;
  markdown: string;
}

/**
 * Publication, indexing and retrieval — everything above the database and
 * below HTTP.
 *
 * The one invariant worth stating out loud: chunking is expensive (it reads
 * every page blob) and is therefore performed ONLY for revisions a channel
 * points at. A PR preview that is published and never pointed at costs a few
 * index rows, not a full re-chunk of the corpus.
 */
/** Page blobs read at once while indexing a revision. */
const INGEST_CONCURRENCY = 12;

/**
 * Maps `items` through `worker` with at most `limit` in flight, preserving
 * input order in the result.
 *
 * Hand-rolled rather than adding a dependency; the implementation is short
 * and the alternative is a transitive package for ten lines.
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

export class ColophonService {
  readonly #db: ColophonDatabase;
  readonly #storage: BundleStorage;
  readonly #logger: LoggerService;
  readonly #chunking: ChunkingOptions;
  readonly #retention: { revisionsPerChannel: number };

  constructor(options: ColophonServiceOptions) {
    this.#db = options.db;
    this.#storage = options.storage;
    this.#logger = options.logger;
    this.#chunking = options.chunking;
    this.#retention = options.retention;
  }

  get db(): ColophonDatabase {
    return this.#db;
  }

  /** Reads and validates a published manifest straight from object storage. */
  async readManifest(bundleId: string, revisionId: string): Promise<Manifest> {
    const body = await this.#storage.get(manifestKey(bundleId, revisionId));
    const manifest = parseManifest(JSON.parse(body.toString('utf8')));
    if (manifest.bundleId !== bundleId || manifest.revisionId !== revisionId) {
      throw new InputError(
        `Manifest at ${manifestKey(bundleId, revisionId)} declares ` +
          `${manifest.bundleId}@${manifest.revisionId}`,
      );
    }
    return manifest;
  }

  /**
   * Records a published revision and points a channel at it. This is the call
   * CI makes once its blobs are uploaded.
   */
  async registerRevision(options: {
    bundleId: string;
    revisionId: string;
    channel?: string;
    isDefault?: boolean;
  }): Promise<{ channel: ChannelRecord; ingest: IngestResult }> {
    const channel = options.channel ?? DEFAULT_CHANNEL;
    const manifest = await this.readManifest(
      options.bundleId,
      options.revisionId,
    );
    // Only the revision row here. Pointing a channel at it runs ingest,
    // which replaces the page rows unconditionally — writing them here too
    // would DELETE and re-INSERT every page of the bundle twice on the
    // common publish path. Nothing can read an unpointed revision anyway,
    // since every read resolves through a channel.
    await this.#db.upsertRevision(manifest);
    return this.setChannel({
      bundleId: options.bundleId,
      channel,
      revisionId: options.revisionId,
      // Publishing to `latest` claims the default unless told otherwise, so
      // the common case needs no extra flag from CI.
      isDefault: options.isDefault ?? channel === DEFAULT_CHANNEL,
    });
  }

  /** Repoints a channel. Rollback is exactly this call with an older id. */
  async setChannel(options: {
    bundleId: string;
    channel: string;
    revisionId: string;
    isDefault?: boolean;
  }): Promise<{ channel: ChannelRecord; ingest: IngestResult }> {
    const revision = await this.#db.getRevision(options.revisionId);
    if (!revision) {
      throw new NotFoundError(`Unknown revision "${options.revisionId}"`);
    }
    if (revision.bundleId !== options.bundleId) {
      throw new InputError(
        `Revision "${options.revisionId}" belongs to bundle ` +
          `"${revision.bundleId}", not "${options.bundleId}"`,
      );
    }
    await this.#db.setChannel({
      bundleId: options.bundleId,
      channel: options.channel,
      revisionId: options.revisionId,
      isDefault: options.isDefault ?? false,
      at: new Date().toISOString(),
    });
    const ingest = await this.ingestRevision(
      options.bundleId,
      options.revisionId,
    );
    // Housekeeping must not fail a publish whose work has already landed.
    // The channel is repointed and the revision indexed by this line; a
    // retention error here means old rows linger until the next run, which
    // is a far better outcome than CI reporting a failed publish.
    try {
      await this.collectGarbage(options.bundleId);
    } catch (error) {
      this.#logger.warn(
        `Retention pass failed for ${options.bundleId}; stale revisions will be collected on the next publish`,
        error as Error,
      );
    }
    return {
      channel: await this.#db.resolveChannel(options.bundleId, options.channel),
      ingest,
    };
  }

  async resolve(bundleId: string, channel?: string): Promise<ChannelRecord> {
    return this.#db.resolveChannel(bundleId, channel);
  }

  /**
   * Reads every page of a revision, chunks it, and stores the result.
   *
   * Idempotent twice over: a revision that already carries `indexed_at` is
   * skipped outright, and re-running with `force` regenerates byte-identical
   * rows because chunk ids are derived from (revision, slug, ordinal).
   */
  async ingestRevision(
    bundleId: string,
    revisionId: string,
    options: { force?: boolean } = {},
  ): Promise<IngestResult> {
    const channels = await this.#db.listChannels(bundleId);
    if (!channels.some(c => c.revisionId === revisionId)) {
      this.#logger.debug(
        `Skipping index of ${bundleId}@${revisionId}: no channel points at it`,
      );
      return { revisionId, indexed: false, chunkCount: 0 };
    }

    let revision = await this.#db.getRevision(revisionId);
    const manifest = revision
      ? await this.#db.getManifest(revisionId)
      : await this.readManifest(bundleId, revisionId);
    if (!revision) {
      await this.#db.upsertRevision(manifest);
      revision = await this.#db.getRevision(revisionId);
    }
    // Pages are replaced unconditionally rather than only on first sight.
    // A failure between upsertRevision and this call would otherwise leave a
    // revision row with no pages, which reads as a 404 on every page and
    // which ingest would never repair, because the revision row exists.
    await this.#db.replacePages(revisionId, manifest.pages);
    if (revision?.indexedAt && !options.force) {
      const existing = await this.#db.listChunks(revisionId);
      return { revisionId, indexed: false, chunkCount: existing.length };
    }

    // Blobs are fetched with bounded concurrency. Each is a round trip to
    // object storage, so reading them one at a time makes indexing almost
    // entirely network wait — minutes for a large bundle, during which
    // search results stay stale. Bounded rather than all at once: a
    // thousand-page bundle would otherwise open a thousand connections.
    const bodies = await mapConcurrent(
      manifest.pages,
      INGEST_CONCURRENCY,
      async page => this.#storage.get(blobKey(page.contentHash)),
    );

    const chunks: Array<Omit<ChunkRecord, 'id' | 'revisionId'>> = [];
    // Chunking itself stays sequential and in page order, so chunk ordinals
    // and the resulting ids are identical run to run.
    manifest.pages.forEach((page, index) => {
      const derived = chunkPage(
        { title: page.title, markdown: bodies[index].toString('utf8') },
        this.#chunking,
      );
      for (const chunk of derived) {
        chunks.push({ slug: page.slug, ...chunk });
      }
    });
    await this.#db.replaceChunks(revisionId, chunks);
    await this.#db.markIndexed(revisionId, new Date().toISOString());
    this.#logger.info(
      `Indexed ${bundleId}@${revisionId}: ${manifest.pages.length} pages, ` +
        `${chunks.length} chunks`,
    );
    return { revisionId, indexed: true, chunkCount: chunks.length };
  }

  /**
   * Drops revision index rows no channel points at, beyond the retention
   * window. Blobs are left alone on purpose: they are content-addressed and
   * shared between revisions, so deleting them is a bucket lifecycle
   * decision, not this plugin's.
   */
  async collectGarbage(bundleId: string): Promise<string[]> {
    const stale = await this.#db.collectUnreferencedRevisions(
      bundleId,
      this.#retention.revisionsPerChannel,
    );
    if (stale.length > 0) {
      this.#logger.info(
        `Retention: dropped ${stale.length} unreferenced revisions of ${bundleId}`,
      );
    }
    return stale;
  }

  async getManifest(
    bundleId: string,
    channel?: string,
  ): Promise<{ channel: ChannelRecord; manifest: Manifest }> {
    const resolved = await this.#db.resolveChannel(bundleId, channel);
    return {
      channel: resolved,
      manifest: await this.#db.getManifest(resolved.revisionId),
    };
  }

  async getPage(
    bundleId: string,
    slug: string,
    channel?: string,
  ): Promise<ResolvedPage> {
    const resolved = await this.#db.resolveChannel(bundleId, channel);
    const page = await this.#db.getPage(resolved.revisionId, slug);
    if (!page) {
      throw new NotFoundError(
        `Bundle "${bundleId}" has no page "${slug}" on channel ` +
          `"${resolved.channel}"`,
      );
    }
    const body = await this.#storage.get(blobKey(page.contentHash));
    return { channel: resolved, page, markdown: body.toString('utf8') };
  }

  async getAsset(
    bundleId: string,
    path: string,
    channel?: string,
  ): Promise<{ body: Buffer; mediaType: string }> {
    const { manifest } = await this.getManifest(bundleId, channel);
    const asset = manifest.assets.find(candidate => candidate.path === path);
    if (!asset) {
      throw new NotFoundError(`Bundle "${bundleId}" has no asset "${path}"`);
    }
    return {
      body: await this.#storage.get(blobKey(asset.contentHash)),
      mediaType: asset.mediaType,
    };
  }

  async search(options: ChunkSearchOptions): Promise<ChunkSearchResult> {
    return this.#db.searchChunks(options);
  }
}
