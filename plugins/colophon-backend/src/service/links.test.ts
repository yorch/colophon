import { pagePath, pageUrl } from './links';

const BASE = 'https://portal.example.com';
const BUNDLE = 'github.com/org/repo';

const url = (over: Partial<Parameters<typeof pageUrl>[0]> = {}) =>
  pageUrl({ appBaseUrl: BASE, bundleId: BUNDLE, slug: '', ...over });

/**
 * These URLs are the only thing tying an agent's answer back to a source a
 * human can check, and they are also every Backstage Search result. They must
 * match what the frontend actually routes — see DocsBrowser, which reads the
 * page from `?page=` and reserves the fragment for heading anchors.
 */
describe('pageUrl', () => {
  it('puts the bundle id in the path with its slashes intact', () => {
    // The frontend route is /colophon/* and takes the whole remainder as the
    // id, so percent-encoding it here would produce a bundle that does not
    // exist.
    expect(url()).toBe(`${BASE}/colophon/${BUNDLE}`);
  });

  it('carries the page as a query parameter, not a path segment', () => {
    // A slug contains slashes too; only one of the two can own the path.
    expect(url({ slug: 'guides/deploy' })).toBe(
      `${BASE}/colophon/${BUNDLE}?page=guides%2Fdeploy`,
    );
  });

  it('omits the page parameter for the landing page', () => {
    expect(url({ slug: '' })).not.toContain('page=');
  });

  it('reserves the fragment for a heading anchor', () => {
    const result = url({ slug: 'guides/deploy', anchor: 'rotate-credentials' });
    expect(result.endsWith('#rotate-credentials')).toBe(true);
    // Exactly one fragment, and the page is not in it.
    expect(result.split('#')).toHaveLength(2);
  });

  it('omits the default channel, which is what a bare URL resolves to', () => {
    expect(url({ slug: 'a', channel: 'latest' })).not.toContain('channel=');
  });

  it('includes a non-default channel', () => {
    expect(url({ slug: 'a', channel: '1.x' })).toContain('channel=1.x');
  });

  it('prefers the entity page when the bundle is linked to one', () => {
    // That is the page a human would have navigated to anyway.
    expect(
      url({
        slug: 'guides/deploy',
        entityRef: 'component:default/payments-api',
      }),
    ).toBe(
      `${BASE}/catalog/default/component/payments-api/docs?page=guides%2Fdeploy`,
    );
  });

  it('lowercases the entity kind, as catalog routes expect', () => {
    expect(url({ entityRef: 'Component:default/api' })).toContain(
      '/catalog/default/component/api/docs',
    );
  });

  it('tolerates a trailing slash on the configured base url', () => {
    expect(
      pageUrl({ appBaseUrl: `${BASE}/`, bundleId: BUNDLE, slug: 'a' }),
    ).toBe(`${BASE}/colophon/${BUNDLE}?page=a`);
  });

  it('produces a parseable URL for every combination', () => {
    for (const anchor of [undefined, 'h']) {
      for (const channel of [undefined, '1.x']) {
        for (const slug of ['', 'a', 'a/b/c']) {
          const parsed = new URL(url({ slug, channel, anchor }));
          expect(parsed.pathname).toBe(`/colophon/${BUNDLE}`);
          expect(parsed.searchParams.get('page')).toBe(slug || null);
          expect(parsed.hash).toBe(anchor ? `#${anchor}` : '');
        }
      }
    }
  });
});

/**
 * The portal and the agent surface need the SAME location in two forms, and
 * the difference is not cosmetic: Backstage renders a search result with a
 * router-aware Link, which cannot tell that an absolute URL points at its own
 * origin. Give it one and every documentation result opens in a new browser
 * tab, flagged "Opens in a new window" — while agents, who have no app to be
 * inside, need exactly that absolute form.
 */
describe('pagePath', () => {
  const path = (over: Partial<Parameters<typeof pagePath>[0]> = {}) =>
    pagePath({ bundleId: BUNDLE, slug: '', ...over });

  it('is app-relative, so the router treats it as internal', () => {
    expect(path()).toBe(`/colophon/${BUNDLE}`);
    expect(path()).not.toContain('://');
  });

  it('is exactly pageUrl without the origin', () => {
    // One implementation, two renderings — so a change to routing cannot
    // apply to the portal and not to agents, or the other way round.
    for (const over of [
      {},
      { slug: 'guides/deploy' },
      { slug: 'a', channel: '1.x' },
      { slug: 'a', anchor: 'rotate-credentials' },
      { entityRef: 'component:default/api', slug: 'a' },
    ]) {
      expect(url(over)).toBe(`${BASE}${path(over)}`);
    }
  });

  it('keeps the fragment, which is the point of a search result', () => {
    expect(path({ slug: 'a', anchor: 'chunking' })).toMatch(/#chunking$/);
  });
});
