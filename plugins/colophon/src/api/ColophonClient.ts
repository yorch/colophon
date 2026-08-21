import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { ResponseError } from '@backstage/errors';
import type {
  BundleSummary,
  ChannelInfo,
  ColophonApi,
  ResolvedManifest,
  ResolvedPage,
  SearchFilters,
  SearchResponse,
} from './types';

/**
 * HTTP client for the Colophon backend.
 *
 * Pages come back as markdown rather than JSON, matching the backend's
 * `text/markdown` response — keeping the wire format the same as the stored
 * format is the point of the whole design, so the client does not wrap it.
 */
export class ColophonClient implements ColophonApi {
  readonly #discovery: DiscoveryApi;
  readonly #fetch: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.#discovery = options.discoveryApi;
    this.#fetch = options.fetchApi;
  }

  async #baseUrl(): Promise<string> {
    return this.#discovery.getBaseUrl('colophon');
  }

  /** Bundle ids contain slashes, so every path segment must be encoded. */
  async #url(path: string, query?: URLSearchParams): Promise<string> {
    const base = await this.#baseUrl();
    const search = query?.toString();
    return `${base}${path}${search ? `?${search}` : ''}`;
  }

  async #json<T>(url: string): Promise<T> {
    const response = await this.#fetch.fetch(url);
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return (await response.json()) as T;
  }

  async listBundles(
    filters: { bundleId?: string[]; entityRef?: string[]; q?: string } = {},
  ): Promise<BundleSummary[]> {
    const query = new URLSearchParams();
    appendAll(query, 'bundleId', filters.bundleId);
    appendAll(query, 'entityRef', filters.entityRef);
    if (filters.q) {
      query.set('q', filters.q);
    }
    const { bundles } = await this.#json<{ bundles: BundleSummary[] }>(
      await this.#url('/bundles', query),
    );
    return bundles;
  }

  async getChannels(bundleId: string): Promise<ChannelInfo[]> {
    const { channels } = await this.#json<{ channels: ChannelInfo[] }>(
      await this.#url(`/bundles/${encodeURIComponent(bundleId)}/channels`),
    );
    return channels;
  }

  async getManifest(
    bundleId: string,
    channel?: string,
  ): Promise<ResolvedManifest> {
    return this.#json<ResolvedManifest>(
      await this.#url(
        `/bundles/${encodeURIComponent(bundleId)}/manifest`,
        channelQuery(channel),
      ),
    );
  }

  async getPage(
    bundleId: string,
    slug: string,
    channel?: string,
  ): Promise<ResolvedPage> {
    // The landing page has the empty slug, which must not produce a trailing
    // slash the backend would route differently.
    const suffix = slug
      ? `/${slug.split('/').map(encodeURIComponent).join('/')}`
      : '';
    const url = await this.#url(
      `/bundles/${encodeURIComponent(bundleId)}/pages${suffix}`,
      channelQuery(channel),
    );
    const response = await this.#fetch.fetch(url);
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return {
      markdown: await response.text(),
      revisionId: response.headers.get('x-colophon-revision') ?? '',
      channel: response.headers.get('x-colophon-channel') ?? '',
    };
  }

  async assetUrl(
    bundleId: string,
    path: string,
    channel?: string,
  ): Promise<string> {
    return this.#url(
      `/bundles/${encodeURIComponent(bundleId)}/assets/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      channelQuery(channel),
    );
  }

  async search(
    query: string,
    filters: SearchFilters = {},
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    appendAll(params, 'bundleId', filters.bundleId);
    appendAll(params, 'entityRef', filters.entityRef);
    appendAll(params, 'tag', filters.tag);
    if (filters.type) {
      params.set('type', filters.type);
    }
    if (filters.channel) {
      params.set('channel', filters.channel);
    }
    if (filters.limit !== undefined) {
      params.set('limit', String(filters.limit));
    }
    if (filters.offset !== undefined) {
      params.set('offset', String(filters.offset));
    }
    return this.#json<SearchResponse>(await this.#url('/search', params));
  }
}

function channelQuery(channel?: string): URLSearchParams | undefined {
  return channel ? new URLSearchParams({ channel }) : undefined;
}

function appendAll(
  params: URLSearchParams,
  key: string,
  values: string[] | undefined,
): void {
  for (const value of values ?? []) {
    params.append(key, value);
  }
}
