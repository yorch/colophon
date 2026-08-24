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
