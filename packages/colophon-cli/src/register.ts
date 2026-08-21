/**
 * Tells a Backstage backend that a revision exists and which channel now
 * points at it.
 *
 * Publishing is two steps on purpose: blobs go to storage, then the backend
 * is told. That ordering means a backend outage costs a retry of one small
 * HTTP call rather than a re-upload of the corpus.
 */
export async function registerRevision(options: {
  backendUrl: string;
  bundleId: string;
  revisionId: string;
  channel: string;
  token?: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${options.backendUrl.replace(/\/+$/, '')}/api/colophon/bundles/${encodeURIComponent(
    options.bundleId,
  )}/revisions`;

  const response = await doFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({
      revisionId: options.revisionId,
      channel: options.channel,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Failed to register revision (${response.status} ${response.statusText})${
        body ? `: ${body}` : ''
      }`,
    );
  }
}
