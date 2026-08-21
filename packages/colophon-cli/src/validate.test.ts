import type { AssetDraft, PageDraft } from './types';
import { validate } from './validate';

function page(slug: string, overrides: Partial<PageDraft> = {}): PageDraft {
  return {
    path: slug ? `${slug}.md` : 'index.md',
    slug,
    title: slug || 'Home',
    description: 'A description.',
    status: 'current',
    tags: [],
    headings: [],
    references: [],
    rawBytes: Buffer.from(''),
    body: '',
    ...overrides,
  };
}

const nav = (slugs: string[]) => slugs.map(slug => ({ title: slug, slug }));

describe('duplicate slugs', () => {
  it('rejects index.md colliding with a same-named sibling', () => {
    // Publishing this silently would make one author's edits go nowhere.
    const pages = [
      page('guides', { path: 'guides/index.md' }),
      page('guides', { path: 'guides.md' }),
    ];
    const errors = validate({ pages, assets: [], nav: nav(['guides']) });
    expect(
      errors.some(d => d.level === 'error' && /both resolve/.test(d.message)),
    ).toBe(true);
  });

  it('accepts distinct slugs', () => {
    const pages = [page('a'), page('b')];
    const diagnostics = validate({ pages, assets: [], nav: nav(['a', 'b']) });
    expect(diagnostics.filter(d => d.level === 'error')).toHaveLength(0);
  });
});

describe('link validation', () => {
  it('rejects a link to a page that is not in the bundle', () => {
    const pages = [
      page('a', { references: [{ url: './missing.md', kind: 'link' }] }),
    ];
    const diagnostics = validate({ pages, assets: [], nav: nav(['a']) });
    expect(
      diagnostics.some(
        d => d.level === 'error' && /not a page/.test(d.message),
      ),
    ).toBe(true);
  });

  it('accepts a relative link that resolves', () => {
    const pages = [
      page('guides/a', {
        path: 'guides/a.md',
        references: [{ url: './b.md', kind: 'link' }],
      }),
      page('guides/b', { path: 'guides/b.md' }),
    ];
    const diagnostics = validate({
      pages,
      assets: [],
      nav: nav(['guides/a', 'guides/b']),
    });
    expect(diagnostics.filter(d => d.level === 'error')).toHaveLength(0);
  });

  it('ignores external links', () => {
    const pages = [
      page('a', {
        references: [
          { url: 'https://example.com/x.md', kind: 'link' },
          { url: 'mailto:a@example.com', kind: 'link' },
          { url: '//cdn.example.com/x.png', kind: 'image' },
        ],
      }),
    ];
    expect(
      validate({ pages, assets: [], nav: nav(['a']) }).filter(
        d => d.level === 'error',
      ),
    ).toHaveLength(0);
  });

  it('rejects a fragment that matches no heading on the target page', () => {
    const pages = [
      page('a', { references: [{ url: './b.md#nope', kind: 'link' }] }),
      page('b', { headings: [{ depth: 2, text: 'Real', anchor: 'real' }] }),
    ];
    const diagnostics = validate({ pages, assets: [], nav: nav(['a', 'b']) });
    expect(diagnostics.some(d => /no heading/.test(d.message))).toBe(true);
  });

  it('accepts a fragment that matches a heading', () => {
    const pages = [
      page('a', { references: [{ url: './b.md#real', kind: 'link' }] }),
      page('b', { headings: [{ depth: 2, text: 'Real', anchor: 'real' }] }),
    ];
    expect(
      validate({ pages, assets: [], nav: nav(['a', 'b']) }).filter(
        d => d.level === 'error',
      ),
    ).toHaveLength(0);
  });

  it('validates a bare fragment against the linking page itself', () => {
    const pages = [
      page('a', {
        references: [{ url: '#missing', kind: 'link' }],
        headings: [{ depth: 2, text: 'Here', anchor: 'here' }],
      }),
    ];
    expect(
      validate({ pages, assets: [], nav: nav(['a']) }).some(
        d => d.level === 'error',
      ),
    ).toBe(true);
  });

  it('rejects an image with no matching asset', () => {
    const pages = [
      page('a', { references: [{ url: './_assets/x.png', kind: 'image' }] }),
    ];
    expect(
      validate({ pages, assets: [], nav: nav(['a']) }).some(
        d => d.level === 'error',
      ),
    ).toBe(true);
  });

  it('accepts an image whose asset was collected', () => {
    const assets: AssetDraft[] = [
      { path: '_assets/x.png', mediaType: 'image/png', bytes: Buffer.from('') },
    ];
    const pages = [
      page('a', { references: [{ url: './_assets/x.png', kind: 'image' }] }),
    ];
    expect(
      validate({ pages, assets, nav: nav(['a']) }).filter(
        d => d.level === 'error',
      ),
    ).toHaveLength(0);
  });
});

describe('descriptions', () => {
  it('warns by default so adoption is not blocked on day one', () => {
    const pages = [page('a', { description: undefined })];
    const diagnostics = validate({ pages, assets: [], nav: nav(['a']) });
    expect(
      diagnostics.some(
        d => d.level === 'warning' && /description/.test(d.message),
      ),
    ).toBe(true);
  });

  it('becomes an error under strict, once a team has adopted the convention', () => {
    const pages = [page('a', { description: undefined })];
    const diagnostics = validate({
      pages,
      assets: [],
      nav: nav(['a']),
      strict: true,
    });
    expect(
      diagnostics.some(
        d => d.level === 'error' && /description/.test(d.message),
      ),
    ).toBe(true);
  });
});

describe('orphans and root', () => {
  it('warns about a page missing from the navigation', () => {
    const pages = [page(''), page('hidden')];
    const diagnostics = validate({ pages, assets: [], nav: nav(['']) });
    expect(
      diagnostics.some(
        d => d.path === 'hidden.md' && /not reachable/.test(d.message),
      ),
    ).toBe(true);
  });

  it('warns when there is no landing page', () => {
    const pages = [page('a')];
    const diagnostics = validate({ pages, assets: [], nav: nav(['a']) });
    expect(diagnostics.some(d => /no index.md/.test(d.message))).toBe(true);
  });

  it('reports nothing for an empty bundle, which is a valid starting point', () => {
    expect(validate({ pages: [], assets: [], nav: [] })).toHaveLength(0);
  });
});
