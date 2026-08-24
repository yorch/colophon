import { ConfigReader } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import type { Source } from '@brnby/colophon-common';
import { pageSourceLinks } from './sourceLinks';

/**
 * A real `ScmIntegrations` rather than a stub.
 *
 * The whole point of routing through the registry is that it, not this
 * package, knows how each provider spells an edit URL — so a stub that
 * returned whatever this test expected would assert nothing about the thing
 * under test. These hosts include a self-hosted GitHub Enterprise and a
 * self-hosted GitLab, because resolving those correctly is the reason the
 * registry is involved at all.
 */
const scm = ScmIntegrations.fromConfig(
  new ConfigReader({
    integrations: {
      github: [
        { host: 'github.com' },
        {
          host: 'ghe.example.com',
          apiBaseUrl: 'https://ghe.example.com/api/v3',
        },
      ],
      gitlab: [
        { host: 'gitlab.com' },
        {
          host: 'git.example.com',
          apiBaseUrl: 'https://git.example.com/api/v4',
        },
      ],
      bitbucketCloud: [{ username: 'u', appPassword: 'p' }],
    },
  }),
);

const source = (overrides: Partial<Source> = {}): Source => ({
  type: 'git',
  url: 'https://github.com/yorch/colophon',
  ref: 'main',
  commit: 'abc123',
  path: 'docs',
  ...overrides,
});

describe('pageSourceLinks', () => {
  it('builds a GitHub view URL and the edit URL the integration derives', () => {
    const links = pageSourceLinks({
      scm,
      source: source(),
      pagePath: 'guides/deploy.md',
    });

    expect(links).toEqual({
      viewUrl:
        'https://github.com/yorch/colophon/tree/main/docs/guides/deploy.md',
      editUrl:
        'https://github.com/yorch/colophon/edit/main/docs/guides/deploy.md',
    });
  });

  it('resolves a self-hosted GitHub Enterprise host', () => {
    const links = pageSourceLinks({
      scm,
      source: source({ url: 'https://ghe.example.com/team/api' }),
      pagePath: 'index.md',
    });

    expect(links?.editUrl).toBe(
      'https://ghe.example.com/team/api/edit/main/docs/index.md',
    );
  });

  it('uses GitLab’s own URL shape, not GitHub’s', () => {
    const links = pageSourceLinks({
      scm,
      source: source({ url: 'https://git.example.com/group/proj', ref: 'v2' }),
      pagePath: 'ops/runbook.md',
    });

    expect(links).toEqual({
      viewUrl:
        'https://git.example.com/group/proj/-/blob/v2/docs/ops/runbook.md',
      editUrl:
        'https://git.example.com/group/proj/-/edit/v2/docs/ops/runbook.md',
    });
  });

  it('marks a Bitbucket Cloud file for editing the way Bitbucket does', () => {
    const links = pageSourceLinks({
      scm,
      source: source({ url: 'https://bitbucket.org/team/repo' }),
      pagePath: 'index.md',
    });

    expect(links?.viewUrl).toBe(
      'https://bitbucket.org/team/repo/src/main/docs/index.md',
    );
    expect(links?.editUrl).toContain('mode=edit');
  });

  it('honours a docs directory that is not "docs"', () => {
    const links = pageSourceLinks({
      scm,
      source: source({ path: 'website/content' }),
      pagePath: 'a/b.md',
    });

    expect(links?.viewUrl).toBe(
      'https://github.com/yorch/colophon/tree/main/website/content/a/b.md',
    );
  });

  /**
   * Every bundle published before source links shipped, and every bundle
   * whose CI never passed `--source-*`, lands here. The header renders no
   * link at all rather than one that 404s.
   */
  it.each([
    ['no source at all', undefined],
    ['an empty url', source({ url: '' })],
    ['no ref', source({ ref: '' })],
  ])('returns nothing for %s', (_name, value) => {
    expect(
      pageSourceLinks({ scm, source: value, pagePath: 'index.md' }),
    ).toBeUndefined();
  });

  it('returns nothing when no page is selected', () => {
    expect(
      pageSourceLinks({ scm, source: source(), pagePath: undefined }),
    ).toBeUndefined();
  });

  it('returns nothing for a host with no configured integration', () => {
    // Guessing a URL shape for an unknown provider would put a broken link on
    // every page, which reads as intentional and so goes unreported.
    expect(
      pageSourceLinks({
        scm,
        source: source({ url: 'https://svn.example.com/team/repo' }),
        pagePath: 'index.md',
      }),
    ).toBeUndefined();
  });

  /**
   * Percent-encoded separators are the variant that got through: the WHATWG
   * URL parser does not decode `%2F`, so the segment stays literal and a
   * containment check on the composed string passes.
   */
  it.each([
    ['plain traversal', '../../../etc/passwd'],
    ['percent-encoded slashes', '..%2f..%2f..%2fetc/passwd'],
    ['uppercase percent-encoding', '..%2F..%2Fetc/passwd'],
    ['percent-encoded backslashes', '..%5c..%5cetc/passwd'],
    ['doubly encoded', '..%252f..%252fetc/passwd'],
    ['encoded dots', '%2e%2e%2f%2e%2e%2fetc/passwd'],
  ])('refuses a page path using %s', (_name, pagePath) => {
    expect(
      pageSourceLinks({ scm, source: source(), pagePath }),
    ).toBeUndefined();
  });

  /**
   * The docs root is composed from three manifest fields, and only one of
   * them used to be checked. Each of these produced a plausible-looking link
   * to somewhere else in — or above — the repository.
   */
  it.each([
    ['path', source({ path: '../../..' })],
    ['path, encoded', source({ path: '..%2f..%2f..' })],
    ['ref', source({ ref: 'main/../../..' })],
    ['ref, encoded', source({ ref: 'main%2f..%2f..' })],
  ])(
    'refuses a source.%s that climbs out of the repository',
    (_name, value) => {
      expect(
        pageSourceLinks({ scm, source: value, pagePath: 'index.md' }),
      ).toBeUndefined();
    },
  );

  it('still accepts a nested page path with no traversal', () => {
    // The guard must not reject ordinary nesting, which is most pages.
    expect(
      pageSourceLinks({
        scm,
        source: source(),
        pagePath: 'guides/deep/nested/page.md',
      })?.viewUrl,
    ).toBe(
      'https://github.com/yorch/colophon/tree/main/docs/guides/deep/nested/page.md',
    );
  });

  it('does not let a page path escape the docs root', () => {
    expect(
      pageSourceLinks({
        scm,
        source: source(),
        pagePath: '../../../etc/passwd',
      }),
    ).toBeUndefined();
  });
});
