import { deleteBundle, deleteChannel, listRetainedRevisions } from './retire';

const BACKEND = 'https://backstage.example.com/';

function respond(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('retire', () => {
  it('addresses the channel route with an encoded bundle id', async () => {
    // Bundle ids contain slashes — they are repository names — so an
    // unencoded id would address a route that does not exist.
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return respond({
        bundleId: 'github.com/org/repo',
        channel: 'pr-42',
        revisionsCollected: [],
      });
    }) as unknown as typeof fetch;

    await deleteChannel({
      backendUrl: BACKEND,
      bundleId: 'github.com/org/repo',
      channel: 'pr-42',
      fetchImpl,
    });

    expect(calls[0]).toEqual({
      url: 'https://backstage.example.com/api/colophon/bundles/github.com%2Forg%2Frepo/channels/pr-42',
      method: 'DELETE',
    });
  });

  it('reports the backend body when a deletion is refused', async () => {
    const fetchImpl = (async () =>
      respond(
        { error: { message: 'nope' } },
        {
          status: 403,
        },
      )) as unknown as typeof fetch;

    await expect(
      deleteBundle({
        backendUrl: BACKEND,
        bundleId: 'github.com/org/repo',
        fetchImpl,
      }),
    ).rejects.toThrow(/403/);
  });

  describe('listRetainedRevisions', () => {
    it('pages to exhaustion', async () => {
      // A partial answer here is not a smaller sweep: every revision beyond
      // the first page would be unknown, and everything it references would
      // be classified as garbage.
      const all = Array.from({ length: 1200 }, (_, index) => ({
        bundleId: 'github.com/org/repo',
        revisionId: String(index),
      }));
      const fetchImpl = (async (url: string) => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        const limit = Number(new URL(url).searchParams.get('limit'));
        return respond({
          revisions: all.slice(offset, offset + limit),
          total: all.length,
          offset,
          limit,
        });
      }) as unknown as typeof fetch;

      expect(
        await listRetainedRevisions({ backendUrl: BACKEND, fetchImpl }),
      ).toHaveLength(1200);
    });

    it('stops when a page comes back empty rather than looping', async () => {
      // `total` is a snapshot; rows can vanish underneath the walk. Trusting
      // it alone turns a concurrent deletion into an infinite loop.
      const fetchImpl = (async () =>
        respond({
          revisions: [],
          total: 99,
          offset: 0,
          limit: 500,
        })) as unknown as typeof fetch;

      expect(
        await listRetainedRevisions({ backendUrl: BACKEND, fetchImpl }),
      ).toEqual([]);
    });
  });
});
