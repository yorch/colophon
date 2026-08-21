import { pageUrl } from './links';

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
