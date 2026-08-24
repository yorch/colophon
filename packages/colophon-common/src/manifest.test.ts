import {
  MANIFEST_SCHEMA_VERSION,
  type Manifest,
  manifestSchema,
  navNodeSchema,
  pageSchema,
  parseManifest,
} from './manifest';

const HASH = 'a'.repeat(64);
const REVISION = 'b'.repeat(64);

function minimalManifest(overrides: Partial<Manifest> = {}): unknown {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    bundleId: 'github.com/brnby/payments-api',
    revisionId: REVISION,
    createdAt: '2026-08-20T10:00:00.000Z',
    source: {
      type: 'git',
      url: 'https://github.com/brnby/payments-api',
      ref: 'main',
      commit: 'c'.repeat(40),
      path: 'docs',
    },
    title: 'Payments API',
    pages: [
      {
        path: 'index.md',
        slug: '',
        title: 'Payments API',
        contentHash: HASH,
        size: 128,
      },
    ],
    nav: [{ title: 'Overview', slug: '' }],
    ...overrides,
  };
}

describe('pageSchema', () => {
  it('defaults status, tags and headings so producers may omit them', () => {
    const page = pageSchema.parse({
      path: 'guides/deploy.md',
      slug: 'guides/deploy',
      title: 'Deploy',
      contentHash: HASH,
      size: 10,
    });

    expect(page.status).toBe('current');
    expect(page.tags).toEqual([]);
    expect(page.headings).toEqual([]);
  });

  it('rejects a heading depth outside h1-h6', () => {
    const withHeading = (depth: number) =>
      pageSchema.parse({
        path: 'a.md',
        slug: 'a',
        title: 'A',
        contentHash: HASH,
        size: 1,
        headings: [{ depth, text: 'H', anchor: 'h' }],
      });

    expect(() => withHeading(0)).toThrow();
    expect(() => withHeading(7)).toThrow();
    expect(withHeading(3).headings[0].depth).toBe(3);
  });

  it('rejects an unknown doc type', () => {
    expect(() =>
      pageSchema.parse({
        path: 'a.md',
        slug: 'a',
        title: 'A',
        contentHash: HASH,
        size: 1,
        type: 'blogpost',
      }),
    ).toThrow();
  });

  it('rejects a non-sha256 content hash', () => {
    expect(() =>
      pageSchema.parse({
        path: 'a.md',
        slug: 'a',
        title: 'A',
        contentHash: 'not-a-hash',
        size: 1,
      }),
    ).toThrow();
  });

  it('accepts the empty slug used by the bundle landing page', () => {
    expect(
      pageSchema.parse({
        path: 'index.md',
        slug: '',
        title: 'Home',
        contentHash: HASH,
        size: 1,
      }).slug,
    ).toBe('');
  });
});

describe('navNodeSchema', () => {
  it('accepts a group header that has no page of its own', () => {
    const node = navNodeSchema.parse({
      title: 'Guides',
      children: [{ title: 'Deploy', slug: 'guides/deploy' }],
    });

    expect(node.slug).toBeUndefined();
    expect(node.children).toHaveLength(1);
  });

  it('accepts arbitrary nesting depth', () => {
    const deep = {
      title: 'a',
      children: [{ title: 'b', children: [{ title: 'c', slug: 'a/b/c' }] }],
    };
    expect(navNodeSchema.parse(deep)).toEqual(deep);
  });

  it('requires a title', () => {
    expect(() => navNodeSchema.parse({ slug: 'orphan' })).toThrow();
  });
});

describe('manifestSchema', () => {
  it('parses a minimal manifest', () => {
    const manifest = parseManifest(minimalManifest());
    expect(manifest.bundleId).toBe('github.com/brnby/payments-api');
    expect(manifest.assets).toEqual([]);
  });

  it('pins the schema version so old readers fail loudly rather than guess', () => {
    expect(() =>
      manifestSchema.parse(minimalManifest({ schemaVersion: 2 as never })),
    ).toThrow();
  });

  it('rejects a non-ISO createdAt', () => {
    expect(() =>
      manifestSchema.parse(minimalManifest({ createdAt: '2026-08-20' })),
    ).toThrow();
  });

  it('requires UTC, rejecting a local-offset createdAt', () => {
    // Timestamps are canonicalised to UTC so they sort lexicographically and
    // never carry offset ambiguity. Publishers must emit a trailing Z.
    expect(() =>
      manifestSchema.parse(
        minimalManifest({ createdAt: '2026-08-20T10:00:00+02:00' }),
      ),
    ).toThrow();
  });

  it('rejects an invalid bundle id, reusing the shared id rules', () => {
    expect(() =>
      manifestSchema.parse(minimalManifest({ bundleId: 'GitHub.com/API' })),
    ).toThrow();
  });

  it('carries no channel — content and routing are separate concerns', () => {
    // A manifest describes content. Channel assignment is recorded by the
    // backend at publish time, which is what keeps revisions immutable.
    expect(Object.keys(manifestSchema.shape)).not.toContain('channel');
  });

  it('accepts an empty bundle, so a docs directory may start out empty', () => {
    const manifest = parseManifest(minimalManifest({ pages: [], nav: [] }));
    expect(manifest.pages).toEqual([]);
  });

  it('round-trips through JSON unchanged', () => {
    const parsed = parseManifest(minimalManifest());
    expect(parseManifest(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});

/**
 * `metadata` is an addition to the wire format, so what matters is not that
 * it round-trips — it is that neither side of a half-upgraded deployment
 * breaks on the other's bundles. Both directions are asserted here because
 * only one of them can be observed by running the current code against the
 * current code.
 */
describe('custom frontmatter passthrough', () => {
  const page = (extra: object) => ({
    path: 'guides/deploy.md',
    slug: 'guides/deploy',
    title: 'Deploy',
    contentHash: HASH,
    size: 10,
    ...extra,
  });

  it('carries unrecognised keys through verbatim', () => {
    const parsed = pageSchema.parse(
      page({ metadata: { owner: 'platform', jira: 'PLAT-1', reviewed: true } }),
    );

    expect(parsed.metadata).toEqual({
      owner: 'platform',
      jira: 'PLAT-1',
      reviewed: true,
    });
  });

  it('preserves nested and non-string values, having no opinion on shape', () => {
    const parsed = pageSchema.parse(
      page({ metadata: { sla: { tier: 1, hours: [9, 17] }, archived: null } }),
    );

    expect(parsed.metadata).toEqual({
      sla: { tier: 1, hours: [9, 17] },
      archived: null,
    });
  });

  // NEW backend, OLD bundle: every revision published before this shipped.
  it('reads a page published without the field', () => {
    const parsed = pageSchema.parse(page({}));

    expect(parsed.metadata).toBeUndefined();
    expect(parsed.title).toBe('Deploy');
  });

  // OLD backend, NEW bundle. A zod object strips what it does not declare,
  // so the older schema — reconstructed here by omitting the key — parses a
  // newer page successfully and simply does not see the extra field.
  it('lets a schema without the field still parse a page that has one', () => {
    const olderPageSchema = pageSchema.omit({ metadata: true });

    const parsed = olderPageSchema.parse(page({ metadata: { owner: 'x' } }));

    expect(parsed).not.toHaveProperty('metadata');
    expect(parsed.title).toBe('Deploy');
  });

  it('parses a whole manifest whose pages carry the field', () => {
    const manifest = parseManifest(
      minimalManifest({
        pages: [
          {
            path: 'index.md',
            slug: '',
            title: 'Payments API',
            contentHash: HASH,
            size: 128,
            status: 'current',
            tags: [],
            headings: [],
            metadata: { owner: 'payments' },
          },
        ],
      }),
    );

    expect(manifest.pages[0].metadata).toEqual({ owner: 'payments' });
  });
});
