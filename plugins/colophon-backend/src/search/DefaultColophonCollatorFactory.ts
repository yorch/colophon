import { Readable } from 'node:stream';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  DocumentCollatorFactory,
  IndexableDocument,
} from '@backstage/plugin-search-common';
import type { DocStatus, DocType } from '@brnby/colophon-common';
import type { ColophonService } from '../service/ColophonService';
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

/**
 * Projects Colophon chunks into Backstage Search.
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

  readonly #colophon: ColophonService;
  readonly #logger: LoggerService;
  readonly #appBaseUrl: string;

  constructor(options: {
    colophon: ColophonService;
    logger: LoggerService;
    appBaseUrl: string;
  }) {
    this.#colophon = options.colophon;
    this.#logger = options.logger;
    this.#appBaseUrl = options.appBaseUrl;
  }

  async getCollator(): Promise<Readable> {
    return Readable.from(this.#execute());
  }

  async *#execute(): AsyncGenerator<ColophonDocument> {
    const db = this.#colophon.db;
    const bundles = await db.listBundles();
    const links = await db.listEntityLinks();

    for (const bundle of bundles) {
      const channel = bundle.channels.find(candidate => candidate.isDefault);
      if (!channel) {
        this.#logger.debug(
          `Skipping ${bundle.bundleId}: no default channel to index`,
        );
        continue;
      }

      const pages = new Map(
        (await db.listPages(channel.revisionId)).map(page => [page.slug, page]),
      );
      const chunks = await db.listChunks(channel.revisionId);

      for (const chunk of chunks) {
        const page = pages.get(chunk.slug);
        if (!page) {
          continue;
        }
        // Prefer the most specific entity: a monorepo bundle can carry many,
        // each scoped to a subtree of slugs.
        const link = links
          .filter(
            candidate =>
              candidate.bundleId === bundle.bundleId &&
              (!candidate.subpath ||
                chunk.slug === candidate.subpath ||
                chunk.slug.startsWith(`${candidate.subpath}/`)),
          )
          .sort(
            (a, b) => (b.subpath?.length ?? 0) - (a.subpath?.length ?? 0),
          )[0];

        yield {
          title: chunk.breadcrumb[chunk.breadcrumb.length - 1] ?? page.title,
          text: chunk.text,
          location: pageUrl({
            appBaseUrl: this.#appBaseUrl,
            bundleId: bundle.bundleId,
            slug: chunk.slug,
            channel: channel.channel,
            anchor: chunk.anchor,
            entityRef: link?.entityRef,
          }),
          bundleId: bundle.bundleId,
          channel: channel.channel,
          slug: chunk.slug,
          anchor: chunk.anchor,
          breadcrumb: chunk.breadcrumb,
          pageTitle: page.title,
          type: page.type,
          status: page.status,
          tags: page.tags,
          entityRef: link?.entityRef,
          // Lets the permission framework filter results by the entity the
          // docs belong to, rather than exposing every bundle to everyone.
          ...(link ? { authorization: { resourceRef: link.entityRef } } : {}),
        };
      }
    }
  }
}
