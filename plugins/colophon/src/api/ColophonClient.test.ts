import { ColophonClient } from './ColophonClient';

const BASE = 'http://backstage/api/colophon';

function clientWith(handler: (url: string) => Response) {
  const calls: string[] = [];
  const fetchApi = {
    fetch: async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return handler(url);
    },
  };
  const client = new ColophonClient({
    discoveryApi: { getBaseUrl: async () => BASE },
    fetchApi: fetchApi as never,
  });
  return { client, calls };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('URL construction', () => {
  it('encodes the bundle id, which contains slashes', async () => {
    const { client, calls } = clientWith(() => json({ channels: [] }));
    await client.getChannels('github.com/brnby/api');
    expect(calls[0]).toBe(`${BASE}/bundles/github.com%2Fbrnby%2Fapi/channels`);
  });

  it('omits the slug segment for the landing page', async () => {
    // A trailing slash would hit a different backend route.
    const { client, calls } = clientWith(
      () => new Response('# Home', { status: 200 }),
    );
    await client.getPage('b', '');
    expect(calls[0]).toBe(`${BASE}/bundles/b/pages`);
  });

  it('encodes each slug segment separately, keeping the path structure', async () => {
    const { client, calls } = clientWith(
      () => new Response('body', { status: 200 }),
    );
    await client.getPage('b', 'guides/deploy');
    expect(calls[0]).toBe(`${BASE}/bundles/b/pages/guides/deploy`);
  });

  it('passes the channel as a query parameter', async () => {
    const { client, calls } = clientWith(() => json({ manifest: {} }));
    await client.getManifest('b', '1.x');
    expect(calls[0]).toContain('?channel=1.x');
  });

  it('repeats list filters rather than joining them', async () => {
    const { client, calls } = clientWith(() => json({ bundles: [] }));
    await client.listBundles({
      entityRef: ['component:default/a', 'component:default/b'],
    });
    expect(calls[0]).toContain('entityRef=component%3Adefault%2Fa');
    expect(calls[0]).toContain('entityRef=component%3Adefault%2Fb');
  });

  it('sends search filters and pagination', async () => {
    const { client, calls } = clientWith(() =>
      json({ results: [], total: 0, limit: 10, offset: 0 }),
    );
    await client.search('rotate', { type: 'how-to', limit: 5, offset: 10 });
    expect(calls[0]).toContain('q=rotate');
    expect(calls[0]).toContain('type=how-to');
    expect(calls[0]).toContain('limit=5');
    expect(calls[0]).toContain('offset=10');
  });
});

describe('responses', () => {
  it('returns markdown and the revision headers for a page', async () => {
    const { client } = clientWith(
      () =>
        new Response('# Title', {
          status: 200,
          headers: {
            'x-colophon-revision': 'abc',
            'x-colophon-channel': 'latest',
          },
        }),
    );
    expect(await client.getPage('b', 'a')).toEqual({
      markdown: '# Title',
      revisionId: 'abc',
      channel: 'latest',
    });
  });

  it('unwraps the bundles envelope', async () => {
    const { client } = clientWith(() =>
      json({ bundles: [{ bundleId: 'b', title: 'B', channels: [] }] }),
    );
    expect(await client.listBundles()).toHaveLength(1);
  });
});

describe('errors', () => {
  it('rejects with a Backstage ResponseError on a non-2xx', async () => {
    const { client } = clientWith(
      () =>
        new Response(JSON.stringify({ error: { message: 'nope' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(client.getManifest('b')).rejects.toThrow();
  });

  it('surfaces an error for a failed page fetch too', async () => {
    const { client } = clientWith(() => new Response('no', { status: 500 }));
    await expect(client.getPage('b', 'a')).rejects.toThrow();
  });
});
