import {
  bundleIdSchema,
  channelSchema,
  ENTRY_SLUG,
  entrySlug,
  formatBundleRef,
  isEntrySlug,
  isWithinSubpath,
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

describe('isWithinSubpath', () => {
  // Contract, not a local helper: the frontend decides what an entity's docs
  // tab shows with it and the backend decides what the MCP actions return.
  it('admits everything when no subpath is set', () => {
    expect(isWithinSubpath('anything/at/all')).toBe(true);
  });

  it('admits the subpath root itself', () => {
    expect(isWithinSubpath('services/billing', 'services/billing')).toBe(true);
  });

  it('admits a descendant', () => {
    expect(isWithinSubpath('services/billing/api', 'services/billing')).toBe(
      true,
    );
  });

  it('rejects a sibling that merely shares a prefix', () => {
    // Matching on the segment boundary is what keeps services/billing from
    // also claiming services/billing-v2.
    expect(isWithinSubpath('services/billing-v2', 'services/billing')).toBe(
      false,
    );
  });

  it('rejects an unrelated page', () => {
    expect(isWithinSubpath('guides/deploy', 'services/billing')).toBe(false);
  });
});

describe('the entry slug', () => {
  it('is the empty string, which is why it needs a name', () => {
    // Every `slug || fallback` written against this treats the landing page
    // as "no page". The constant exists so the comparison has somewhere to
    // live rather than being re-invented.
    expect(ENTRY_SLUG).toBe('');
    expect(Boolean(ENTRY_SLUG)).toBe(false);
  });

  it('identifies the landing page', () => {
    expect(isEntrySlug('')).toBe(true);
    expect(isEntrySlug('guides/deploy')).toBe(false);
  });

  it('opens an unscoped bundle at its root', () => {
    expect(entrySlug()).toBe(ENTRY_SLUG);
    expect(entrySlug(undefined)).toBe(ENTRY_SLUG);
  });

  it('opens a scoped entity at its own subtree', () => {
    expect(entrySlug('services/billing')).toBe('services/billing');
  });

  it('agrees with slugFromPath about the docs-root index', () => {
    expect(slugFromPath('index.md')).toBe(ENTRY_SLUG);
    expect(isEntrySlug(slugFromPath('index.md'))).toBe(true);
  });
});
