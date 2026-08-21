import { Readable } from 'node:stream';
import type {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import type {
  DocumentCollatorFactory,
  IndexableDocument,
} from '@backstage/plugin-search-common';
import {
  type DocStatus,
  type DocType,
  isWithinSubpath,
} from '@brnby/colophon-common';
import { pageUrl } from '../service/links';

/** The document type Colophon contributes to the portal search index. */
export const COLOPHON_DOCUMENT_TYPE = 'colophon';

export interface ColophonDocument extends IndexableDocument {
  bundleId: string;
  channel: string;
  slug: string;
  anchor?: string;
  breadcrumb: string[];
  pageTitle: string;
  type?: DocType;
  status: DocStatus;
  tags: string[];
  entityRef?: string;
}

/** One row of the backend's `/indexable` projection. */
interface IndexableRow {
  bundle_id: string;
  channel: string;
  slug: string;
  anchor: string | null;
  breadcrumb: string;
  text: string;
  page_title: string;
  page_description: string | null;
  page_type: string | null;
  page_status: string;
  page_tags: string;
}

interface EntityLink {
  entityRef: string;
  bundleId: string;
  subpath?: string;
}

const PAGE_SIZE = 200;

/**
 * Projects Colophon chunks into Backstage Search.
 *
 * Reads over HTTP rather than from the database, and that is not incidental:
 * a Backstage plugin's database is private to that plugin — each gets its own
 * `backstage_plugin_<id>` — and this collator runs as a module of the SEARCH
 * plugin. Opening a database handle here would land in the search plugin's
 * own schema, run Colophon's migrations into it, find it empty, and index
 * nothing at all without erroring. TechDocs' collator reaches its data the
 * same way for the same reason.
 *
 * Two rules decide what is emitted, and both exist to keep the portal search
 * box useful rather than exhaustive:
 *
 *  - only the DEFAULT channel, so a bundle with `latest`, `1.x` and `pr-42`
 *    does not return the same page three times;
 *  - one document per CHUNK, not per page, so a result lands on the heading
 *    that actually answered the query.
 */
export class DefaultColophonCollatorFactory implements DocumentCollatorFactory {
  readonly type = COLOPHON_DOCUMENT_TYPE;

  readonly #discovery: DiscoveryService;
  readonly #auth: AuthService;
  readonly #logger: LoggerService;
  readonly #appBaseUrl: string;

  constructor(options: {
    discovery: DiscoveryService;
    auth: AuthService;
    logger: LoggerService;
    appBaseUrl: string;
  }) {
    this.#discovery = options.discovery;
    this.#auth = options.auth;
    this.#logger = options.logger;
    this.#appBaseUrl = options.appBaseUrl;
  }

  async getCollator(): Promise<Readable> {
    return Readable.from(this.#execute());
  }

  async *#execute(): AsyncGenerator<ColophonDocument> {
    const baseUrl = await this.#discovery.getBaseUrl('colophon');
    const { token } = await this.#auth.getPluginRequestToken({
      onBehalfOf: await this.#auth.getOwnServiceCredentials(),
      targetPluginId: 'colophon',
    });

    let offset = 0;
    let total = 0;
    do {
      const response = await fetch(
        `${baseUrl}/indexable?offset=${offset}&limit=${PAGE_SIZE}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        throw new Error(
          `Colophon indexing failed: ${response.status} ${response.statusText}`,
        );
      }

      const body = (await response.json()) as {
        rows: IndexableRow[];
        total: number;
        links: EntityLink[];
      };
      total = body.total;

      // Narrowed and ordered once per page of results rather than per chunk,
      // and most-specific-first so the per-chunk step is a find.
      const linksByBundle = new Map<string, EntityLink[]>();
      for (const link of body.links) {
        const group = linksByBundle.get(link.bundleId) ?? [];
        group.push(link);
        linksByBundle.set(link.bundleId, group);
      }
      for (const group of linksByBundle.values()) {
        group.sort(
          (a, b) => (b.subpath?.length ?? 0) - (a.subpath?.length ?? 0),
        );
      }

      for (const row of body.rows) {
        yield this.#toDocument(row, linksByBundle.get(row.bundle_id) ?? []);
      }

      offset += PAGE_SIZE;
      // A revision published mid-run shifts later rows; the next scheduled
      // pass picks them up rather than this one paging forever.
    } while (offset < total);

    this.#logger.info(`Colophon collated ${total} chunks for search`);
  }

  #toDocument(row: IndexableRow, links: EntityLink[]): ColophonDocument {
    const breadcrumb = JSON.parse(row.breadcrumb) as string[];
    // The most specific entity wins: a monorepo bundle carries several, each
    // scoped to a subtree, and the deep link should land on the entity a
    // reader would actually have navigated to.
    const entityRef = links.find(link =>
      isWithinSubpath(row.slug, link.subpath),
    )?.entityRef;

    return {
      title: breadcrumb[breadcrumb.length - 1] ?? row.page_title,
      text: row.text,
      location: pageUrl({
        appBaseUrl: this.#appBaseUrl,
        bundleId: row.bundle_id,
        slug: row.slug,
        channel: row.channel,
        anchor: row.anchor ?? undefined,
        entityRef,
      }),
      bundleId: row.bundle_id,
      channel: row.channel,
      slug: row.slug,
      anchor: row.anchor ?? undefined,
      breadcrumb,
      pageTitle: row.page_title,
      type: (row.page_type ?? undefined) as DocType | undefined,
      status: row.page_status as DocStatus,
      tags: JSON.parse(row.page_tags) as string[],
      entityRef,
      // Lets the permission framework filter a result the caller may not see.
      ...(entityRef ? { authorization: { resourceRef: entityRef } } : {}),
    };
  }
}
