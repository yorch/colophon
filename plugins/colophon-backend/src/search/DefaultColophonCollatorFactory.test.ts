import type {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { DefaultColophonCollatorFactory } from './DefaultColophonCollatorFactory';

/**
 * The collator reads over HTTP, so these tests stand a fake `/indexable` in
 * front of `fetch` and assert on what Backstage Search would be handed.
 */

const PAGE_SIZE = 200;

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    bundle_id: 'docs',
    channel: 'latest',
    slug: 'storage',
    anchor: 'chunking',
    breadcrumb: JSON.stringify(['Docs', 'Storage', 'Chunking']),
    text: 'Some prose.',
    ordinal: 0,
    content_hash: 'h',
    revision_id: 'r1',
    page_title: 'Storage',
    page_description: null,
    page_type: null,
    page_status: 'published',
    page_tags: '[]',
    ...overrides,
  };
}

function fakeServer(rows: ReturnType<typeof row>[]) {
  return jest.fn(async (input: string) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    return new Response(
      JSON.stringify({
        rows: rows.slice(offset, offset + limit),
        total: rows.length,
        offset,
        limit,
        links: [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
}

function collatorWith(rows: ReturnType<typeof row>[]) {
  const discovery = {
    getBaseUrl: async () => 'http://colophon.test/api/colophon',
  } as unknown as DiscoveryService;
  const auth = {
    getOwnServiceCredentials: async () => ({}),
    getPluginRequestToken: async () => ({ token: 't' }),
  } as unknown as AuthService;
  const logger = {
    info: () => undefined,
  } as unknown as LoggerService;
  const factory = new DefaultColophonCollatorFactory({
    discovery,
    auth,
    logger,
    appPath: '/colophon',
  });
  return { factory, server: fakeServer(rows) };
}

async function collect(
  factory: DefaultColophonCollatorFactory,
): Promise<Array<{ text: string; location: string; title: string }>> {
  const stream = await factory.getCollator();
  const docs: Array<{ text: string; location: string; title: string }> = [];
  for await (const doc of stream) {
    docs.push(doc as { text: string; location: string; title: string });
  }
  return docs;
}

describe('DefaultColophonCollatorFactory', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits one document per section, not one per chunk', async () => {
    // Two chunks of one long section share a location. Backstage's Lunr
    // engine keys documents by location, so emitting both as separate
    // documents splices one chunk's highlight positions into the other.
    const { factory, server } = collatorWith([
      row({ ordinal: 0, text: 'First part about blobs.' }),
      row({ ordinal: 1, text: 'Second part about manifests.' }),
    ]);
    jest.spyOn(globalThis, 'fetch').mockImplementation(server as never);

    const docs = await collect(factory);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toContain('First part about blobs.');
    expect(docs[0].text).toContain('Second part about manifests.');
    expect(docs[0].title).toBe('Chunking');
  });

  it('keeps distinct sections and pages as distinct documents', async () => {
    const { factory, server } = collatorWith([
      row({ anchor: 'chunking', ordinal: 0 }),
      row({ anchor: 'manifest', ordinal: 1 }),
      row({ slug: 'other', anchor: 'chunking', ordinal: 2 }),
    ]);
    jest.spyOn(globalThis, 'fetch').mockImplementation(server as never);

    const docs = await collect(factory);

    expect(docs.map(doc => doc.location)).toEqual([
      expect.stringContaining('storage'),
      expect.stringContaining('storage'),
      expect.stringContaining('other'),
    ]);
    expect(new Set(docs.map(doc => doc.location)).size).toBe(3);
  });

  it('joins a section that straddles a page boundary into one document', async () => {
    // The first page ends mid-section, so the open group has to survive the
    // fetch. Flushing per page would split the section in two again.
    const rows = Array.from({ length: PAGE_SIZE + 2 }, (_, ordinal) =>
      row({ ordinal, text: `Chunk ${ordinal}.` }),
    );
    const { factory, server } = collatorWith(rows);
    jest.spyOn(globalThis, 'fetch').mockImplementation(server as never);

    const docs = await collect(factory);

    expect(server).toHaveBeenCalledTimes(2);
    expect(docs).toHaveLength(1);
    expect(docs[0].text).toContain(`Chunk ${PAGE_SIZE + 1}.`);
  });

  it('renders chunk markdown as plain text for the index', async () => {
    const { factory, server } = collatorWith([
      row({
        text: '```mermaid\ngraph TD\n  A-->B\n```\n\n| Key | Default |\n| --- | --- |\n| `maxChars` | `1500` |\n',
      }),
    ]);
    jest.spyOn(globalThis, 'fetch').mockImplementation(server as never);

    const [doc] = await collect(factory);

    expect(doc.text).not.toContain('graph TD');
    expect(doc.text).not.toContain('|');
    expect(doc.text).toContain('Key · Default');
    expect(doc.text).toContain('maxChars · 1500');
  });
});
