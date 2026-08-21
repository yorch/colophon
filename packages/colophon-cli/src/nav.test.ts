import type { NavNode } from '@brnby/colophon-common';
import { buildNav, reachableSlugs } from './nav';
import type { PageDraft } from './types';

function page(overrides: Partial<PageDraft> & { slug: string }): PageDraft {
  return {
    path: `${overrides.slug || 'index'}.md`,
    title: overrides.slug || 'Home',
    status: 'current',
    tags: [],
    headings: [],
    references: [],
    rawBytes: Buffer.from(''),
    body: '',
    ...overrides,
  };
}

describe('buildNav (derived from the directory tree)', () => {
  it('puts the docs-root index first so the landing page is reachable', () => {
    const { nav } = buildNav(
      [
        page({ slug: '', title: 'Home' }),
        page({ slug: 'guides/a', title: 'A' }),
      ],
      undefined,
    );
    expect(nav[0]).toMatchObject({ title: 'Home', slug: '' });
  });

  it('collapses a directory index onto the directory node', () => {
    const { nav } = buildNav(
      [
        page({ slug: 'guides', title: 'Guides', path: 'guides/index.md' }),
        page({ slug: 'guides/deploy', title: 'Deploy' }),
      ],
      undefined,
    );
    const guides = nav.find(n => n.slug === 'guides');
    expect(guides?.title).toBe('Guides');
    expect(guides?.children?.[0]).toMatchObject({ slug: 'guides/deploy' });
  });

  it('creates a group header for a directory with no index page', () => {
    const { nav } = buildNav([page({ slug: 'how-to/thing' })], undefined);
    expect(nav[0].title).toBe('How To');
    expect(nav[0].slug).toBeUndefined();
  });

  it('orders by navOrder before title', () => {
    const { nav } = buildNav(
      [
        page({ slug: 'b', title: 'Beta', navOrder: 1 }),
        page({ slug: 'a', title: 'Alpha', navOrder: 2 }),
      ],
      undefined,
    );
    expect(nav.map(n => n.slug)).toEqual(['b', 'a']);
  });

  it('falls back to title order when navOrder is absent', () => {
    const { nav } = buildNav(
      [page({ slug: 'b', title: 'Beta' }), page({ slug: 'a', title: 'Alpha' })],
      undefined,
    );
    expect(nav.map(n => n.title)).toEqual(['Alpha', 'Beta']);
  });
});

describe('buildNav (explicit docs.yaml nav)', () => {
  it('uses the declared order rather than the directory order', () => {
    const { nav } = buildNav(
      [page({ slug: 'a', title: 'Alpha' }), page({ slug: 'b', title: 'Beta' })],
      [{ page: 'b.md' }, { page: 'a.md' }],
    );
    expect(nav.map(n => n.slug)).toEqual(['b', 'a']);
  });

  it('supports a group header carrying no page of its own', () => {
    const { nav } = buildNav(
      [page({ slug: 'a', title: 'Alpha' })],
      [{ title: 'Section', children: [{ page: 'a.md' }] }],
    );
    expect(nav[0].title).toBe('Section');
    expect(nav[0].slug).toBeUndefined();
    expect(nav[0].children?.[0]).toMatchObject({ slug: 'a' });
  });

  it('reports a nav entry pointing at a page that does not exist', () => {
    const { diagnostics } = buildNav(
      [page({ slug: 'a' })],
      [{ page: 'missing.md' }],
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].level).toBe('error');
  });

  it('lets an explicit title override the page title', () => {
    const { nav } = buildNav(
      [page({ slug: 'a', title: 'Original' })],
      [{ page: 'a.md', title: 'Override' }],
    );
    expect(nav[0].title).toBe('Override');
  });
});

describe('reachableSlugs', () => {
  it('walks nested children', () => {
    const nav: NavNode[] = [
      { title: 'A', slug: 'a', children: [{ title: 'B', slug: 'a/b' }] },
    ];
    expect(reachableSlugs(nav)).toEqual(new Set(['a', 'a/b']));
  });

  it('includes the empty slug of the landing page', () => {
    expect(reachableSlugs([{ title: 'Home', slug: '' }]).has('')).toBe(true);
  });

  it('skips group headers, which have no page', () => {
    expect(reachableSlugs([{ title: 'Group' }]).size).toBe(0);
  });
});
