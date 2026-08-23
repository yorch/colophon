import type {
  DeleteBundleResponse,
  DeleteChannelResponse,
  ListRetainedRevisionsResponse,
  RetainedRevision,
} from '@brnby/colophon-common';

/**
 * The write half of the backend API that is not publishing: retiring a
 * channel, retiring a bundle, and asking what is still retained.
 *
 * Separate from `register.ts` because these are what CI does when a pull
 * request closes or a repository is decommissioned, not when it builds. They
 * share the module because they share the authentication story — a bearer
 * token carrying the same `colophon.docs.publish` permission that publishing
 * needs, since an identity that may repoint a channel can already orphan what
 * it pointed at.
 */

export interface BackendOptions {
  backendUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

/** Revisions asked for at a time when walking the retained set. */
const RETAINED_PAGE_SIZE = 500;

async function call(
  options: BackendOptions,
  method: string,
  path: string,
): Promise<unknown> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${options.backendUrl.replace(/\/+$/, '')}/api/colophon${path}`;
  const response = await doFetch(url, {
    method,
    headers: options.token
      ? { authorization: `Bearer ${options.token}` }
      : undefined,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `${method} ${path} failed (${response.status} ${response.statusText})${
        body ? `: ${body}` : ''
      }`,
    );
  }
  return response.json();
}

export async function deleteChannel(
  options: BackendOptions & { bundleId: string; channel: string },
): Promise<DeleteChannelResponse> {
  return (await call(
    options,
    'DELETE',
    `/bundles/${encodeURIComponent(options.bundleId)}/channels/${encodeURIComponent(
      options.channel,
    )}`,
  )) as DeleteChannelResponse;
}

export async function deleteBundle(
  options: BackendOptions & { bundleId: string },
): Promise<DeleteBundleResponse> {
  return (await call(
    options,
    'DELETE',
    `/bundles/${encodeURIComponent(options.bundleId)}`,
  )) as DeleteBundleResponse;
}

/**
 * Every revision the backend still keeps, paged to exhaustion.
 *
 * Paged to exhaustion and not to the first response, for the same reason a
 * bucket listing is: a partial answer here is not a smaller sweep, it is a
 * sweep that considers most of the corpus unreachable.
 */
export async function listRetainedRevisions(
  options: BackendOptions,
): Promise<RetainedRevision[]> {
  const revisions: RetainedRevision[] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = (await call(
      options,
      'GET',
      `/revisions?offset=${offset}&limit=${RETAINED_PAGE_SIZE}`,
    )) as ListRetainedRevisionsResponse;
    revisions.push(...page.revisions);
    total = page.total;
    offset += page.revisions.length;
    // A page that returns nothing while claiming more would loop forever;
    // trusting `total` alone is not enough when rows are being deleted
    // underneath the walk.
    if (page.revisions.length === 0) {
      break;
    }
  } while (revisions.length < total);
  return revisions;
}
