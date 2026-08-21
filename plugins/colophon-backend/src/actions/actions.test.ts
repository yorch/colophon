import knexFactory, { type Knex } from 'knex';
import {
  createHarness,
  DEFAULT_BUNDLE,
  longBody,
  revisionId,
} from '../__testUtils__/harness';
import { registerColophonActions } from './index';

const REV = revisionId('a');
const APP_URL = 'http://localhost:3000';

interface Registered {
  name: string;
  title: string;
  description: string;
  attributes: { readOnly?: boolean; idempotent?: boolean };
  schema: { input: (z: unknown) => unknown; output: (z: unknown) => unknown };
  action: (ctx: {
    input: Record<string, unknown>;
  }) => Promise<{ output: unknown }>;
}

/**
 * Captures what the plugin registers, rather than reaching through a live
 * MCP transport. The contract that matters here is the action definition —
 * the transport is Backstage's and is already its own tested thing.
 */
function captureActions() {
  const registered = new Map<string, Registered>();
  const actionsRegistry = {
    register: (definition: Registered) =>
      registered.set(definition.name, definition),
  };
  return { registered, actionsRegistry };
}

async function setup() {
  const knex: Knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  const harness = await createHarness({ knex });
  await harness.register({
    revisionId: REV,
    channel: 'latest',
    isDefault: true,
    title: 'Payments API',
    pages: [
      {
        slug: '',
        title: 'Payments API',
        description: 'The payments service.',
        markdown: `# Payments API\n\n${longBody('overview')}`,
      },
      {
        slug: 'guides/rotate',
        title: 'Rotating credentials',
        description: 'How to rotate database credentials.',
        type: 'how-to',
        tags: ['security'],
        markdown: `## Rotate\n\n${longBody('rotate')}\n\n## Verify\n\n${longBody('verify')}`,
      },
    ],
  });

  const { registered, actionsRegistry } = captureActions();
  registerColophonActions({
    actionsRegistry: actionsRegistry as never,
    colophon: harness.colophon,
    authorizer: harness.authorizer,
    appBaseUrl: APP_URL,
  });

  return {
    harness,
    registered,
    run: (name: string, input: Record<string, unknown>) => {
      const definition = registered.get(name);
      if (!definition) {
        throw new Error(`No action registered named "${name}"`);
      }
      return definition.action({ input });
    },
    cleanup: async () => {
      await harness.cleanup();
      await knex.destroy();
    },
  };
}

describe('registration', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });
  afterEach(() => s.cleanup());

  it('registers exactly the four documented actions', () => {
    // A small tool surface is a design constraint, not an accident: model
    // accuracy degrades measurably as the number of tools grows.
    expect([...s.registered.keys()].sort()).toEqual([
      'get-page',
      'list-entities',
      'list-pages',
      'search',
    ]);
  });

  it('marks every action read-only and idempotent', () => {
    for (const [name, definition] of s.registered) {
      expect({ name, ...definition.attributes }).toEqual({
        name,
        readOnly: true,
        idempotent: true,
      });
    }
  });

  it('gives every action a description substantial enough to choose on', () => {
    // These sentences are the whole basis on which a model picks a tool.
    for (const definition of s.registered.values()) {
      expect(definition.description.length).toBeGreaterThan(80);
      expect(definition.title).toBeTruthy();
    }
  });
});

describe('search', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });
  afterEach(() => s.cleanup());

  it('returns sections with a breadcrumb and a citable url', async () => {
    const { output } = (await s.run('search', { query: 'rotate' })) as {
      output: { results: Array<Record<string, unknown>>; total: number };
    };
    expect(output.results.length).toBeGreaterThan(0);
    const hit = output.results[0];
    expect(Array.isArray(hit.breadcrumb)).toBe(true);
    expect(String(hit.url)).toContain(APP_URL);
  });

  it('reports what it did not show rather than truncating silently', async () => {
    const { output } = (await s.run('search', {
      query: 'rotate',
      limit: 1,
    })) as {
      output: {
        total: number;
        returned: number;
        remaining: number;
        nextOffset?: number;
      };
    };
    expect(output.returned).toBe(1);
    expect(output.remaining).toBe(output.total - 1);
    if (output.remaining > 0) {
      expect(output.nextOffset).toBe(1);
    }
  });

  it('omits nextOffset once the results are exhausted', async () => {
    const { output } = (await s.run('search', {
      query: 'rotate',
      limit: 50,
    })) as { output: { nextOffset?: number; remaining: number } };
    expect(output.remaining).toBe(0);
    expect(output.nextOffset).toBeUndefined();
  });

  it('returns an empty result set rather than throwing on no match', async () => {
    const { output } = (await s.run('search', {
      query: 'zzzznotpresent',
    })) as { output: { results: unknown[]; total: number } };
    expect(output.results).toEqual([]);
    expect(output.total).toBe(0);
  });
});

describe('get-page', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });
  afterEach(() => s.cleanup());

  it('returns raw markdown, which is the point of the whole design', async () => {
    const { output } = (await s.run('get-page', {
      bundleId: DEFAULT_BUNDLE,
      slug: 'guides/rotate',
    })) as { output: { markdown: string } };
    expect(output.markdown).toContain('## Rotate');
    expect(output.markdown).not.toContain('<h2');
  });

  it('serves the landing page for the empty slug', async () => {
    const { output } = (await s.run('get-page', {
      bundleId: DEFAULT_BUNDLE,
      slug: '',
    })) as { output: { markdown: string } };
    expect(output.markdown).toContain('# Payments API');
  });

  it('fails clearly for a page that does not exist', async () => {
    await expect(
      s.run('get-page', { bundleId: DEFAULT_BUNDLE, slug: 'nope' }),
    ).rejects.toThrow();
  });
});

describe('list-pages and list-entities', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });
  afterEach(() => s.cleanup());

  it('lists pages so an agent can orient before searching', async () => {
    const { output } = (await s.run('list-pages', {
      bundleId: DEFAULT_BUNDLE,
    })) as { output: { pages: Array<{ slug: string }> } };
    expect(output.pages.map(p => p.slug).sort()).toEqual(['', 'guides/rotate']);
  });

  it('lists entities without failing when none are linked', async () => {
    const { output } = (await s.run('list-entities', {})) as {
      output: Record<string, unknown>;
    };
    expect(output).toBeDefined();
  });
});
