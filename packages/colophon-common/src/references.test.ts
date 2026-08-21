import { resolveReference } from './references';

const from = (href: string, fromPath = 'guides/deploy.md') =>
  resolveReference(fromPath, href);

describe('external references', () => {
  it.each([
    'https://example.com/x.md',
    'http://example.com',
    'mailto:a@example.com',
    '//cdn.example.com/x.png',
    'tel:+441234',
  ])('leaves %s alone', href => {
    expect(from(href)).toEqual({ kind: 'external', href });
  });
});

describe('page references', () => {
  it('resolves a sibling page', () => {
    expect(from('./rollback.md')).toEqual({
      kind: 'page',
      slug: 'guides/rollback',
    });
  });

  it('resolves a parent-relative page', () => {
    expect(from('../index.md')).toEqual({ kind: 'page', slug: '' });
  });

  it('treats a leading slash as the docs root', () => {
    expect(from('/reference/limits.md')).toEqual({
      kind: 'page',
      slug: 'reference/limits',
    });
  });

  it('carries a fragment through as an anchor', () => {
    expect(from('./rollback.md#step-two')).toEqual({
      kind: 'page',
      slug: 'guides/rollback',
      anchor: 'step-two',
    });
  });

  it('collapses a directory index to the directory slug', () => {
    expect(from('../reference/index.md')).toEqual({
      kind: 'page',
      slug: 'reference',
    });
  });

  it('decodes a percent-encoded filename', () => {
    // Percent-encoding is the ordinary way to link a name with a space.
    expect(from('./my%20guide.md')).toEqual({
      kind: 'page',
      slug: 'guides/my guide',
    });
  });

  it('accepts .mdx as well as .md', () => {
    expect(from('./notes.mdx').kind).toBe('page');
  });
});

describe('anchors on the current page', () => {
  it('recognises a bare fragment', () => {
    expect(from('#rotating-credentials')).toEqual({
      kind: 'anchor',
      anchor: 'rotating-credentials',
    });
  });

  it('decodes a percent-encoded fragment', () => {
    expect(from('#caf%C3%A9')).toEqual({ kind: 'anchor', anchor: 'café' });
  });
});

describe('asset references', () => {
  it('resolves an image beside the page', () => {
    expect(from('./_assets/diagram.png')).toEqual({
      kind: 'asset',
      path: 'guides/_assets/diagram.png',
    });
  });

  it('resolves an image from the docs root', () => {
    expect(from('/_assets/logo.svg')).toEqual({
      kind: 'asset',
      path: '_assets/logo.svg',
    });
  });

  it('treats an extensionless target as an asset, not a page', () => {
    expect(from('./data').kind).toBe('asset');
  });
});

describe('traversal', () => {
  it('clamps at the docs root rather than escaping it', () => {
    // The publisher rejects such a link, so this only matters for the
    // renderer: it must not be talked into requesting something outside the
    // bundle by a page that slipped through.
    expect(from('../../../../etc/passwd')).toEqual({
      kind: 'asset',
      path: 'etc/passwd',
    });
  });

  it('ignores redundant current-directory segments', () => {
    expect(from('././rollback.md')).toEqual({
      kind: 'page',
      slug: 'guides/rollback',
    });
  });

  it('resolves from the docs root when the page is at the root', () => {
    expect(from('./guides/deploy.md', 'index.md')).toEqual({
      kind: 'page',
      slug: 'guides/deploy',
    });
  });

  it('does not throw on a malformed escape sequence', () => {
    expect(() => from('%E0%A4.md')).not.toThrow();
  });
});
