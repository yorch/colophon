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

describe('percent-encoded targets', () => {
  it('accepts a link to a filename containing a space', () => {
    // Percent-encoding is the ordinary way to write this link; rejecting it
    // failed the whole publish.
    const pages = [
      page('a', { references: [{ url: 'my%20guide.md', kind: 'link' }] }),
      page('my guide', { path: 'my guide.md' }),
    ];
    const diagnostics = validate({
      pages,
      assets: [],
      nav: nav(['a', 'my guide']),
    });
    expect(diagnostics.filter(d => d.level === 'error')).toHaveLength(0);
  });

  it('still rejects an encoded link to a page that does not exist', () => {
    const pages = [
      page('a', { references: [{ url: 'no%20such.md', kind: 'link' }] }),
    ];
    expect(
      validate({ pages, assets: [], nav: nav(['a']) }).some(
        d => d.level === 'error',
      ),
    ).toBe(true);
  });

  it('does not throw on a malformed escape sequence', () => {
    const pages = [
      page('a', { references: [{ url: '%E0%A4.md', kind: 'link' }] }),
    ];
    expect(() =>
      validate({ pages, assets: [], nav: nav(['a']) }),
    ).not.toThrow();
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

  it('rejects an empty bundle rather than letting it empty a channel', () => {
    // This assertion used to say an empty bundle was a valid starting point,
    // which is the assumption that made a mistyped --docs-dir publishable:
    // zero pages, zero diagnostics, and a channel repointed at a revision
    // containing nothing, which reads to everyone else as the documentation
    // having been deleted.
    const diagnostics = validate({ pages: [], assets: [], nav: [] });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].level).toBe('error');
    expect(diagnostics[0].message).toMatch(/no pages found/);
  });
});

describe('diagnostic locations', () => {
  const withRefs = (line: number) =>
    page('a', {
      path: 'guides/a.md',
      references: [{ url: './nope.md', kind: 'link', line }],
    });

  it('reports the line a broken link sits on', () => {
    // The position is free at the point of collection — mdast carries it —
    // and it is the difference between "this file has a broken link" and a
    // location an editor can jump to.
    const [error] = validate({
      pages: [withRefs(11)],
      assets: [],
      nav: nav(['a']),
    }).filter(d => d.level === 'error');
    expect(error.line).toBe(11);
    expect(error.path).toBe('guides/a.md');
  });

  it('omits the line rather than guessing when the parser gave none', () => {
    const [error] = validate({
      pages: [
        page('a', {
          path: 'guides/a.md',
          references: [{ url: './nope.md', kind: 'link' }],
        }),
      ],
      assets: [],
      nav: nav(['a']),
    }).filter(d => d.level === 'error');
    expect(error.line).toBeUndefined();
  });
});

describe('--strict', () => {
  /**
   * `--strict` is documented as "treat advisory diagnostics as errors", and a
   * team adopts it in CI on the strength of that sentence. Promoting only
   * SOME advisories is worse than promoting none: the build is green, the
   * gate is believed to be in place, and the class of problem it was adopted
   * to catch ships anyway.
   *
   * So the assertion here is deliberately not "these three checks" — it is
   * that NOTHING advisory survives, which is the property that stays true
   * when a fourth advisory check is added later.
   */
  const everyAdvisory = () => {
    const pages = [
      // Orphaned (nav is empty), no description, and no index.md at the root
      // — one page that trips every advisory check at once.
      page('a', { description: undefined }),
      page('b', { description: undefined }),
    ];
    return { pages, assets: [], nav: [] };
  };

  it('leaves advisories advisory by default', () => {
    const diagnostics = validate(everyAdvisory());
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every(d => d.level === 'warning')).toBe(true);
  });

  it('promotes every advisory, not just the description check', () => {
    const diagnostics = validate({ ...everyAdvisory(), strict: true });
    const surviving = diagnostics.filter(d => d.level !== 'error');
    expect(surviving).toEqual([]);
  });

  it('still reports the same problems, only louder', () => {
    const lax = validate(everyAdvisory()).map(d => d.message);
    const strict = validate({ ...everyAdvisory(), strict: true }).map(
      d => d.message,
    );
    expect(strict).toEqual(lax);
  });
});
