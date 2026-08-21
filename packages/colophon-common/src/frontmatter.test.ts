import { splitFrontmatter, stripFrontmatter } from './frontmatter';

describe('splitFrontmatter', () => {
  it('separates frontmatter from body', () => {
    expect(splitFrontmatter('---\ntitle: T\n---\n\n# H\n')).toEqual({
      frontmatter: 'title: T',
      body: '\n# H\n',
    });
  });

  it('returns the whole document when there is no frontmatter', () => {
    expect(splitFrontmatter('# H\n')).toEqual({ body: '# H\n' });
  });

  it('handles CRLF line endings', () => {
    const { frontmatter, body } = splitFrontmatter(
      '---\r\ntitle: T\r\n---\r\n\r\n# H\r\n',
    );
    expect(frontmatter).toBe('title: T');
    expect(body).toContain('# H');
  });

  it('strips a leading byte order mark', () => {
    expect(splitFrontmatter('﻿---\ntitle: T\n---\nbody').body).toBe('body');
    expect(stripFrontmatter('﻿# H')).toBe('# H');
  });

  it('requires the closing delimiter to be alone on its line', () => {
    // gray-matter closes on a bare "\n---" substring and would treat this as
    // frontmatter. Disagreeing about the body is what makes the publisher
    // bless anchors the backend never produces.
    const doc = '---\ntitle: T\n--- trailing\n\n## H\n';
    expect(splitFrontmatter(doc).frontmatter).toBeUndefined();
    expect(splitFrontmatter(doc).body).toBe(doc);
  });

  it('keeps a horizontal rule in the body', () => {
    const body = splitFrontmatter(
      '---\ntitle: T\n---\n\n## H\n\n---\n\nmore\n',
    ).body;
    expect(body).toContain('---\n\nmore');
  });

  it('does not close early on an indented rule inside a block scalar', () => {
    const { frontmatter, body } = splitFrontmatter(
      '---\ndesc: |\n  a\n  ----\n  b\n---\n\n## H\n',
    );
    expect(frontmatter).toContain('----');
    expect(body.trim()).toBe('## H');
  });

  it('tolerates empty frontmatter', () => {
    expect(splitFrontmatter('---\n\n---\nbody').frontmatter).toBe('');
  });

  it('leaves a document that only opens a delimiter untouched', () => {
    const doc = '---\ntitle: T\n\n## H\n';
    expect(splitFrontmatter(doc)).toEqual({ body: doc });
  });
});
