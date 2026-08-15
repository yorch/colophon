import {
  bundleIdSchema,
  channelSchema,
  formatBundleRef,
  normalizeSlug,
  parseBundleRef,
  slugFromPath,
} from './ids';

describe('bundleIdSchema', () => {
  it.each([
    'github.com/brnby/payments-api',
    'gitlab.internal/platform/billing',
    'payments-api',
    'a',
  ])('accepts %s', id => {
    expect(bundleIdSchema.parse(id)).toBe(id);
  });

  it.each([
    ['uppercase', 'GitHub.com/brnby/api'],
    ['leading slash', '/github.com/org/repo'],
    ['trailing slash', 'github.com/org/repo/'],
    ['double slash', 'github.com//repo'],
    ['parent traversal', 'github.com/org/../repo'],
    ['space', 'github.com/my repo'],
    ['empty', ''],
  ])('rejects %s', (_name, id) => {
    expect(() => bundleIdSchema.parse(id)).toThrow();
  });
});

describe('channelSchema', () => {
  it.each(['latest', '1.x', 'next', 'pr-42', 'release-2026-01'])(
    'accepts %s',
    name => expect(channelSchema.parse(name)).toBe(name),
  );

  it.each(['Latest', 'release/1.x', '-leading', ''])('rejects %s', name => {
    expect(() => channelSchema.parse(name)).toThrow();
  });
});

describe('normalizeSlug', () => {
  it('lowercases and strips redundant slashes', () => {
    expect(normalizeSlug('/Guides//Deploy/')).toBe('guides/deploy');
  });

  it('is idempotent', () => {
    const once = normalizeSlug('/Guides//Deploy/');
    expect(normalizeSlug(once)).toBe(once);
  });
});

describe('slugFromPath', () => {
  it.each([
    ['index.md', ''],
    ['guides/deploy.md', 'guides/deploy'],
    ['guides/index.md', 'guides'],
    ['Guides/Deploy.md', 'guides/deploy'],
    ['reference/api/index.md', 'reference/api'],
    ['notes.mdx', 'notes'],
  ])('maps %s to "%s"', (path, expected) => {
    expect(slugFromPath(path)).toBe(expected);
  });

  it('collapses index.md and a sibling-named file to the same slug', () => {
    // Callers must treat this as a duplicate-slug error at publish time.
    expect(slugFromPath('guides/index.md')).toBe(slugFromPath('guides.md'));
  });
});

describe('parseBundleRef', () => {
  it('parses a bare bundle id', () => {
    expect(parseBundleRef('github.com/brnby/api')).toEqual({
      bundleId: 'github.com/brnby/api',
    });
  });

  it('parses a subpath-scoped ref for shared monorepo docs', () => {
    expect(
      parseBundleRef('github.com/brnby/platform#services/billing'),
    ).toEqual({
      bundleId: 'github.com/brnby/platform',
      subpath: 'services/billing',
    });
  });

  it('normalizes the subpath', () => {
    expect(
      parseBundleRef('github.com/brnby/platform#/Services/Billing/'),
    ).toEqual({
      bundleId: 'github.com/brnby/platform',
      subpath: 'services/billing',
    });
  });

  it('tolerates surrounding whitespace from YAML', () => {
    expect(parseBundleRef('  github.com/brnby/api  ')).toEqual({
      bundleId: 'github.com/brnby/api',
    });
  });

  it('rejects more than one separator', () => {
    expect(() => parseBundleRef('github.com/brnby/api#a#b')).toThrow(
      /more than one/,
    );
  });

  it('rejects an invalid bundle id', () => {
    expect(() => parseBundleRef('GitHub.com/API')).toThrow();
  });

  it('round-trips through formatBundleRef', () => {
    for (const value of [
      'github.com/brnby/api',
      'github.com/brnby/platform#services/billing',
    ]) {
      expect(formatBundleRef(parseBundleRef(value))).toBe(value);
    }
  });
});
