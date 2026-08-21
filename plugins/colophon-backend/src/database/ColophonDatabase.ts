import { createHash } from 'node:crypto';
import {
  type DatabaseService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import {
  DEFAULT_CHANNEL,
  type Manifest,
  type Page,
} from '@brnby/colophon-common';
import type { Knex } from 'knex';
import type {
  BundleSummary,
  ChannelRecord,
  ChunkRecord,
  ChunkSearchHit,
  ChunkSearchOptions,
  ChunkSearchResult,
  EntityLinkRecord,
  PageRecord,
  RevisionRecord,
} from './types';

const MIGRATIONS_DIR = resolvePackagePath(
  '@brnby/plugin-colophon-backend',
  'migrations',
);

/** Terms this short carry no signal and blow up the SQLite LIKE fallback. */
const MIN_TERM_LENGTH = 2;

interface RevisionRow {
  revision_id: string;
  bundle_id: string;
  created_at: string;
  source_url: string;
  source_ref: string;
  source_commit: string;
  title: string;
  description: string | null;
  manifest: string;
  indexed_at: string | null;
}

interface ChannelRow {
  bundle_id: string;
  channel: string;
  revision_id: string;
  updated_at: string;
  is_default: boolean | number;
}

interface PageRow {
  revision_id: string;
  slug: string;
  title: string;
  description: string | null;
  type: string | null;
  status: string;
  tags: string;
  tags_text: string;
  content_hash: string;
  nav_order: number | null;
}

interface ChunkRow {
  id: string;
  revision_id: string;
  slug: string;
  anchor: string | null;
  breadcrumb: string;
  breadcrumb_text: string;
  text: string;
  ordinal: number;
  content_hash: string;
}

/** Shape returned by {@link ColophonDatabase.listIndexableChunks}. */
export interface IndexableChunkRow extends Omit<ChunkRow, 'breadcrumb_text'> {
  bundle_id: string;
  channel: string;
  page_title: string;
  page_description: string | null;
  page_type: string | null;
  page_status: string;
  page_tags: string;
}

interface EntityLinkRow {
  entity_ref: string;
  bundle_id: string;
  subpath: string | null;
}

function toRevision(row: RevisionRow): RevisionRecord {
  return {
    revisionId: row.revision_id,
    bundleId: row.bundle_id,
    createdAt: row.created_at,
    source: {
      url: row.source_url,
      ref: row.source_ref,
      commit: row.source_commit,
    },
    title: row.title,
    description: row.description ?? undefined,
    indexedAt: row.indexed_at ?? undefined,
  };
}

function toChannel(row: ChannelRow): ChannelRecord {
  return {
    bundleId: row.bundle_id,
    channel: row.channel,
    revisionId: row.revision_id,
    updatedAt: row.updated_at,
    isDefault: Boolean(row.is_default),
  };
}

function toPage(row: PageRow): PageRecord {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description ?? undefined,
    type: (row.type ?? undefined) as PageRecord['type'],
    status: row.status as PageRecord['status'],
    tags: JSON.parse(row.tags) as string[],
    contentHash: row.content_hash,
    navOrder: row.nav_order ?? undefined,
  };
}

function toChunk(row: ChunkRow): ChunkRecord {
  return {
    id: row.id,
    revisionId: row.revision_id,
    slug: row.slug,
    anchor: row.anchor ?? undefined,
    breadcrumb: JSON.parse(row.breadcrumb) as string[],
    text: row.text,
    ordinal: row.ordinal,
    contentHash: row.content_hash,
  };
}

/** `|api|billing|` — bracketed so `LIKE '%|api|%'` cannot match `|apiv2|`. */
function tagsText(tags: string[]): string {
  return tags.length > 0 ? `|${tags.join('|')}|` : '';
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, match => `\\${match}`);
}

/** Deterministic so a re-index of the same revision keeps its chunk ids. */
export function chunkId(
  revisionId: string,
  slug: string,
  ordinal: number,
): string {
  return createHash('sha256')
    .update(`${revisionId}\n${slug}\n${ordinal}`)
    .digest('hex');
}

/**
 * Every query the plugin makes, in one place.
 *
 * The full-text story is deliberately dual. Postgres gets a generated
 * `tsvector` column with a GIN index and `ts_rank` ordering; SQLite — which
 * is what `yarn start` and every test in this repo actually run against —
 * gets term-wise LIKE scoring. Pretending Postgres is always available would
 * mean the dev experience never exercises search at all.
 */
export class ColophonDatabase {
  readonly #knex: Knex;

  private constructor(knex: Knex) {
    this.#knex = knex;
  }

  static async create(options: {
    database: DatabaseService;
  }): Promise<ColophonDatabase> {
    const knex = await options.database.getClient();
    if (!options.database.migrations?.skip) {
      await knex.migrate.latest({ directory: MIGRATIONS_DIR });
    }
    return new ColophonDatabase(knex);
  }

  /** Test seam; production code should go through the methods below. */
  get knex(): Knex {
    return this.#knex;
  }

  get isPostgres(): boolean {
    return this.#knex.client.config.client.includes('pg');
  }

  async upsertRevision(manifest: Manifest): Promise<void> {
    const row: RevisionRow = {
      revision_id: manifest.revisionId,
      bundle_id: manifest.bundleId,
      created_at: manifest.createdAt,
      source_url: manifest.source.url,
      source_ref: manifest.source.ref,
      source_commit: manifest.source.commit,
      title: manifest.title,
      description: manifest.description ?? null,
      manifest: JSON.stringify(manifest),
      indexed_at: null,
    };
    // A revision is immutable, so re-publishing the same one must not reset
    // `indexed_at` and force a pointless re-chunk.
    const { indexed_at: _ignored, ...mutable } = row;
    await this.#knex('colophon_revisions')
      .insert(row)
      .onConflict('revision_id')
      .merge(mutable);
  }

  async getRevision(revisionId: string): Promise<RevisionRecord | undefined> {
    const row = await this.#knex<RevisionRow>('colophon_revisions')
      .where('revision_id', revisionId)
      .first();
    return row ? toRevision(row) : undefined;
  }

  async getManifest(revisionId: string): Promise<Manifest> {
    const row = await this.#knex<RevisionRow>('colophon_revisions')
      .select('manifest')
      .where('revision_id', revisionId)
      .first();
    if (!row) {
      throw new NotFoundError(`Unknown revision "${revisionId}"`);
    }
    return JSON.parse(row.manifest) as Manifest;
  }

  async listRevisions(bundleId: string): Promise<RevisionRecord[]> {
    const rows = await this.#knex<RevisionRow>('colophon_revisions')
      .where('bundle_id', bundleId)
      .orderBy('created_at', 'desc');
    return rows.map(toRevision);
  }

  async markIndexed(revisionId: string, at: string): Promise<void> {
    await this.#knex('colophon_revisions')
      .where('revision_id', revisionId)
      .update({ indexed_at: at });
  }

  async replacePages(revisionId: string, pages: Page[]): Promise<void> {
    await this.#knex.transaction(async trx => {
      await trx('colophon_pages').where('revision_id', revisionId).delete();
      if (pages.length === 0) {
        return;
      }
      const rows: PageRow[] = pages.map(page => ({
        revision_id: revisionId,
        slug: page.slug,
        title: page.title,
        description: page.description ?? null,
        type: page.type ?? null,
        status: page.status,
        tags: JSON.stringify(page.tags),
        tags_text: tagsText(page.tags),
        content_hash: page.contentHash,
        nav_order: page.navOrder ?? null,
      }));
      await trx.batchInsert('colophon_pages', rows, 200);
    });
  }

  async listPages(revisionId: string): Promise<PageRecord[]> {
    const rows = await this.#knex<PageRow>('colophon_pages')
      .where('revision_id', revisionId)
      .orderBy('slug', 'asc');
    return rows.map(toPage);
  }

  async getPage(
    revisionId: string,
    slug: string,
  ): Promise<PageRecord | undefined> {
    const row = await this.#knex<PageRow>('colophon_pages')
      .where({ revision_id: revisionId, slug })
      .first();
    return row ? toPage(row) : undefined;
  }

  async replaceChunks(
    revisionId: string,
    chunks: Array<Omit<ChunkRecord, 'id' | 'revisionId'>>,
  ): Promise<void> {
    await this.#knex.transaction(async trx => {
      await trx('colophon_chunks').where('revision_id', revisionId).delete();
      if (chunks.length === 0) {
        return;
      }
      const rows = chunks.map(chunk => ({
        id: chunkId(revisionId, chunk.slug, chunk.ordinal),
        revision_id: revisionId,
        slug: chunk.slug,
        anchor: chunk.anchor ?? null,
        breadcrumb: JSON.stringify(chunk.breadcrumb),
        breadcrumb_text: chunk.breadcrumb.join(' › '),
        text: chunk.text,
        ordinal: chunk.ordinal,
        content_hash: chunk.contentHash,
      }));
      await trx.batchInsert('colophon_chunks', rows, 200);
    });
  }

  async listChunks(revisionId: string, slug?: string): Promise<ChunkRecord[]> {
    const query = this.#knex<ChunkRow>('colophon_chunks').where(
      'revision_id',
      revisionId,
    );
    if (slug !== undefined) {
      query.andWhere('slug', slug);
    }
    const rows = await query.orderBy('ordinal', 'asc');
    return rows.map(toChunk);
  }

  async setChannel(options: {
    bundleId: string;
    channel: string;
    revisionId: string;
    isDefault: boolean;
    at: string;
  }): Promise<void> {
    const row: ChannelRow = {
      bundle_id: options.bundleId,
      channel: options.channel,
      revision_id: options.revisionId,
      updated_at: options.at,
      is_default: options.isDefault,
    };
    await this.#knex.transaction(async trx => {
      if (options.isDefault) {
        // Exactly one default per bundle — Backstage Search must not receive
        // the same page once per version.
        await trx('colophon_channels')
          .where('bundle_id', options.bundleId)
          .andWhereNot('channel', options.channel)
          .update({ is_default: false });
      }
      await trx('colophon_channels')
        .insert(row)
        .onConflict(['bundle_id', 'channel'])
        .merge(['revision_id', 'updated_at', 'is_default']);
    });
  }

  async deleteChannel(bundleId: string, channel: string): Promise<boolean> {
    const deleted = await this.#knex('colophon_channels')
      .where({ bundle_id: bundleId, channel })
      .delete();
    return deleted > 0;
  }

  async listChannels(bundleId?: string): Promise<ChannelRecord[]> {
    const query = this.#knex<ChannelRow>('colophon_channels');
    if (bundleId !== undefined) {
      query.where('bundle_id', bundleId);
    }
    const rows = await query.orderBy(['bundle_id', 'channel']);
    return rows.map(toChannel);
  }

  /**
   * Resolves a channel to the revision it points at, defaulting to the
   * bundle's default channel and then to `latest`.
   */
  async resolveChannel(
    bundleId: string,
    channel?: string,
  ): Promise<ChannelRecord> {
    const channels = await this.listChannels(bundleId);
    if (channels.length === 0) {
      throw new NotFoundError(`Unknown bundle "${bundleId}"`);
    }
    if (channel !== undefined) {
      const named = channels.find(c => c.channel === channel);
      if (!named) {
        throw new NotFoundError(
          `Bundle "${bundleId}" has no channel "${channel}"`,
        );
      }
      return named;
    }
    const fallback =
      channels.find(c => c.isDefault) ??
      channels.find(c => c.channel === DEFAULT_CHANNEL);
    if (!fallback) {
      throw new NotFoundError(
        `Bundle "${bundleId}" has no default channel; ask for one explicitly`,
      );
    }
    return fallback;
  }

  async listBundles(filter?: {
    bundleIds?: string[];
    query?: string;
  }): Promise<BundleSummary[]> {
    const query = this.#knex('colophon_channels as ch')
      .join('colophon_revisions as r', function join() {
        this.on('r.revision_id', 'ch.revision_id').andOn(
          'r.bundle_id',
          'ch.bundle_id',
        );
      })
      .select(
        'ch.bundle_id',
        'ch.channel',
        'ch.revision_id',
        'ch.updated_at',
        'ch.is_default',
        'r.title',
        'r.description',
      )
      .orderBy(['ch.bundle_id', 'ch.channel']);

    if (filter?.bundleIds?.length) {
      query.whereIn('ch.bundle_id', filter.bundleIds);
    }
    if (filter?.query) {
      const like = `%${escapeLike(filter.query.toLowerCase())}%`;
      query.andWhere(builder =>
        builder
          .whereRaw(`lower(ch.bundle_id) LIKE ? ESCAPE '\\'`, [like])
          .orWhereRaw(`lower(r.title) LIKE ? ESCAPE '\\'`, [like]),
      );
    }

    const rows: Array<
      ChannelRow & { title: string; description: string | null }
    > = await query;

    const byBundle = new Map<string, BundleSummary>();
    for (const row of rows) {
      const channel = toChannel(row);
      const summary = byBundle.get(row.bundle_id) ?? {
        bundleId: row.bundle_id,
        title: row.title,
        description: row.description ?? undefined,
        channels: [],
      };
      summary.channels.push(channel);
      if (channel.isDefault) {
        summary.defaultChannel = channel.channel;
        // The default channel decides the bundle's human-facing identity.
        summary.title = row.title;
        summary.description = row.description ?? undefined;
      }
      byBundle.set(row.bundle_id, summary);
    }
    return [...byBundle.values()];
  }

  /**
   * Deletes unreferenced revisions beyond the retention window, atomically.
   *
   * Selection and deletion share one transaction, and the delete re-checks
   * the channel table rather than trusting the ids chosen a moment earlier.
   * Splitting the two lets a concurrent setChannel point a channel at a
   * revision already marked for collection, and since colophon_channels
   * carries a foreign key to colophon_revisions with no ON DELETE, the delete
   * then fails outright — aborting a publish whose work had already landed.
   */
  async collectUnreferencedRevisions(
    bundleId: string,
    keep: number,
  ): Promise<string[]> {
    return this.#knex.transaction(async trx => {
      const rows = await trx('colophon_revisions as r')
        .where('r.bundle_id', bundleId)
        .whereNotExists(function pointedAt() {
          this.select(trx.raw('1'))
            .from('colophon_channels as ch')
            .whereRaw('ch.revision_id = r.revision_id');
        })
        .orderBy('r.created_at', 'desc')
        .select('r.revision_id');

      const stale = rows.slice(keep).map(row => row.revision_id as string);
      if (stale.length === 0) {
        return [];
      }

      await trx('colophon_chunks').whereIn('revision_id', stale).delete();
      await trx('colophon_pages').whereIn('revision_id', stale).delete();
      // The same NOT EXISTS guard again: between the select above and here a
      // channel could still have claimed one, and the transaction's read
      // snapshot does not prevent that on every isolation level.
      const deleted = await trx('colophon_revisions as r')
        .whereIn('r.revision_id', stale)
        .whereNotExists(function pointedAt() {
          this.select(trx.raw('1'))
            .from('colophon_channels as ch')
            .whereRaw('ch.revision_id = r.revision_id');
        })
        .delete();

      return deleted > 0 ? stale : [];
    });
  }

  async deleteRevisions(revisionIds: string[]): Promise<void> {
    if (revisionIds.length === 0) {
      return;
    }
    // Explicit child deletes rather than ON DELETE CASCADE: SQLite only
    // enforces foreign keys when the pragma is on, and this must behave the
    // same on both engines.
    await this.#knex.transaction(async trx => {
      await trx('colophon_chunks').whereIn('revision_id', revisionIds).delete();
      await trx('colophon_pages').whereIn('revision_id', revisionIds).delete();
      await trx('colophon_revisions')
        .whereIn('revision_id', revisionIds)
        .delete();
    });
  }

  async replaceEntityLinks(links: EntityLinkRecord[]): Promise<void> {
    await this.#knex.transaction(async trx => {
      await trx('colophon_entity_links').delete();
      if (links.length === 0) {
        return;
      }
      const rows: EntityLinkRow[] = links.map(link => ({
        entity_ref: link.entityRef,
        bundle_id: link.bundleId,
        subpath: link.subpath ?? null,
      }));
      await trx.batchInsert('colophon_entity_links', rows, 200);
    });
  }

  async listEntityLinks(filter?: {
    entityRefs?: string[];
    bundleIds?: string[];
  }): Promise<EntityLinkRecord[]> {
    const query = this.#knex<EntityLinkRow>('colophon_entity_links');
    if (filter?.entityRefs?.length) {
      query.whereIn('entity_ref', filter.entityRefs);
    }
    if (filter?.bundleIds?.length) {
      query.whereIn('bundle_id', filter.bundleIds);
    }
    const rows = await query.orderBy('entity_ref', 'asc');
    return rows.map(row => ({
      entityRef: row.entity_ref,
      bundleId: row.bundle_id,
      subpath: row.subpath ?? undefined,
    }));
  }

  /**
   * Every chunk on a DEFAULT channel, in a stable order, for search indexing.
   *
   * Default-only is the rule that keeps the portal search box usable: a bundle
   * with `latest`, `1.x` and `pr-42` would otherwise return the same page once
   * per channel.
   */
  /**
   * Chunks joined to the revision, channel and page they belong to.
   *
   * Both retrieval paths need exactly this shape: a chunk is only reachable
   * through a channel, and its page metadata is what makes a result useful.
   * Keeping the join in one place means the two cannot drift into disagreeing
   * about which chunks are visible.
   */
  #chunksWithContext(): Knex.QueryBuilder {
    return this.#knex('colophon_chunks as c')
      .join('colophon_revisions as r', 'r.revision_id', 'c.revision_id')
      .join('colophon_channels as ch', function join() {
        this.on('ch.revision_id', 'c.revision_id').andOn(
          'ch.bundle_id',
          'r.bundle_id',
        );
      })
      .join('colophon_pages as p', function join() {
        this.on('p.revision_id', 'c.revision_id').andOn('p.slug', 'c.slug');
      });
  }

  async listIndexableChunks(options: {
    offset: number;
    limit: number;
  }): Promise<{ rows: IndexableChunkRow[]; total: number }> {
    const base = this.#chunksWithContext().where('ch.is_default', true);

    const [countRow] = await base.clone().count({ total: '*' });
    const rows: IndexableChunkRow[] = await base
      .select(
        'c.id',
        'c.revision_id',
        'c.slug',
        'c.anchor',
        'c.breadcrumb',
        'c.text',
        'c.ordinal',
        'c.content_hash',
        'r.bundle_id',
        'ch.channel',
        { page_title: 'p.title' },
        { page_description: 'p.description' },
        { page_type: 'p.type' },
        { page_status: 'p.status' },
        { page_tags: 'p.tags' },
      )
      .orderBy([
        { column: 'r.bundle_id', order: 'asc' },
        { column: 'c.slug', order: 'asc' },
        { column: 'c.ordinal', order: 'asc' },
      ])
      .limit(options.limit)
      .offset(options.offset);

    return { rows, total: Number(countRow?.total ?? 0) };
  }

  async searchChunks(options: ChunkSearchOptions): Promise<ChunkSearchResult> {
    // Punctuation SPLITS a term rather than being deleted from inside it.
    // Deleting turned "creds:1" into "creds1", which matches nothing even
    // though the literal string is in the corpus — precisely the
    // identifier-shaped query a documentation search exists to serve.
    const terms = options.query
      .toLowerCase()
      .split(/[^\p{L}\p{N}._-]+/u)
      .filter(term => term.length >= MIN_TERM_LENGTH);
    if (terms.length === 0) {
      return { hits: [], total: 0 };
    }

    const base = this.#chunksWithContext();

    if (options.channel) {
      base.where('ch.channel', options.channel);
    } else {
      base.where('ch.is_default', true);
    }
    if (options.bundleIds?.length) {
      base.whereIn('r.bundle_id', options.bundleIds);
    }
    if (options.type) {
      base.where('p.type', options.type);
    }
    for (const tag of options.tags ?? []) {
      base.whereRaw(`p.tags_text LIKE ? ESCAPE '\\'`, [
        `%|${escapeLike(tag)}|%`,
      ]);
    }
    if (options.entityRefs?.length) {
      const links = await this.listEntityLinks({
        entityRefs: options.entityRefs,
      });
      if (links.length === 0) {
        return { hits: [], total: 0 };
      }
      base.andWhere(outer => {
        for (const link of links) {
          outer.orWhere(inner => {
            inner.where('r.bundle_id', link.bundleId);
            if (link.subpath) {
              // A subpath-scoped entity sees the subtree and nothing else.
              inner.andWhere(scope =>
                scope
                  .where('c.slug', link.subpath as string)
                  .orWhereRaw(`c.slug LIKE ? ESCAPE '\\'`, [
                    `${escapeLike(link.subpath as string)}/%`,
                  ]),
              );
            }
          });
        }
      });
    }

    // Known asymmetry, and deliberate: Postgres runs a real full-text query,
    // so it stems and drops stopwords — "the and" reduces to an empty tsquery
    // and matches nothing. The SQLite path is substring scoring with no
    // linguistic knowledge, so the same query matches any chunk containing
    // "the". Postgres has the better behaviour; SQLite is the dev and test
    // fallback and reimplementing a stemmer there would cost more than it is
    // worth. Tests that must hold on both live in ColophonDatabase.test.ts,
    // which runs against every configured backend for exactly this reason.
    const score = this.isPostgres
      ? this.#knex.raw(
          `ts_rank(c.search_vector, plainto_tsquery('english', ?))`,
          [options.query],
        )
      : this.#knex.raw(
          `(${terms
            .map(
              () =>
                `(CASE WHEN lower(c.breadcrumb_text) LIKE ? ESCAPE '\\' THEN 3 ELSE 0 END + ` +
                `CASE WHEN lower(c.text) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)`,
            )
            .join(' + ')}) / ${(terms.length * 4).toFixed(1)}`,
          terms.flatMap(term => {
            const like = `%${escapeLike(term)}%`;
            return [like, like];
          }),
        );

    if (this.isPostgres) {
      base.whereRaw(`c.search_vector @@ plainto_tsquery('english', ?)`, [
        options.query,
      ]);
    } else {
      // Parenthesised by hand: knex splices `whereRaw` in verbatim, so an
      // unwrapped chain of ORs would out-rank the AND filters above it.
      base.whereRaw(
        `(${terms
          .map(
            () =>
              `(lower(c.breadcrumb_text) LIKE ? ESCAPE '\\' OR lower(c.text) LIKE ? ESCAPE '\\')`,
          )
          .join(' OR ')})`,
        terms.flatMap(term => {
          const like = `%${escapeLike(term)}%`;
          return [like, like];
        }),
      );
    }

    const [countRow] = await base.clone().count({ total: '*' });
    const total = Number(countRow?.total ?? 0);

    const rows: Array<
      ChunkRow & {
        bundle_id: string;
        channel: string;
        score: number | string;
        page_title: string;
        page_description: string | null;
        page_type: string | null;
        page_status: string;
        page_tags: string;
      }
    > = await base
      .select(
        'c.id',
        'c.revision_id',
        'c.slug',
        'c.anchor',
        'c.breadcrumb',
        'c.breadcrumb_text',
        'c.text',
        'c.ordinal',
        'c.content_hash',
        'r.bundle_id',
        'ch.channel',
        { score },
        { page_title: 'p.title' },
        { page_description: 'p.description' },
        { page_type: 'p.type' },
        { page_status: 'p.status' },
        { page_tags: 'p.tags' },
      )
      .orderBy([
        { column: 'score', order: 'desc' },
        { column: 'c.id', order: 'asc' },
      ])
      .limit(options.limit)
      .offset(options.offset);

    const hits: ChunkSearchHit[] = rows.map(row => ({
      ...toChunk(row),
      bundleId: row.bundle_id,
      channel: row.channel,
      score: Number(row.score),
      page: {
        title: row.page_title,
        description: row.page_description ?? undefined,
        type: (row.page_type ?? undefined) as PageRecord['type'],
        status: row.page_status as PageRecord['status'],
        tags: JSON.parse(row.page_tags) as string[],
      },
    }));
    return { hits, total };
  }
}
