import { parse as parseYaml } from 'yaml';
import { docsConfigSchema, parseDocsConfig } from './config';

/**
 * `docs.yaml` is the one part of the contract written by hand, in YAML, by
 * people who will never read this source — so the cases that matter are not
 * the well-formed ones. They are the plausible mistakes, and whether each
 * produces a message that names what to fix.
 *
 * Parsing real YAML rather than object literals is deliberate: several of
 * these bugs only exist because of what YAML does to input (a bare key
 * becomes `null`, an anchor can refer to itself), and an object literal
 * cannot reproduce them.
 */
describe('docs.yaml', () => {
  const parse = (yaml: string) =>
    docsConfigSchema.safeParse(parseYaml(yaml) ?? {});
  const messages = (yaml: string) =>
    parse(yaml)
      .error?.issues.map(issue => issue.message)
      .join(' | ') ?? '';

  it('defaults everything, because the file itself is optional', () => {
    expect(parseDocsConfig({})).toEqual({ exclude: [] });
  });

  it('accepts a key written with no value', () => {
    // YAML turns `nav:` alone on a line into null. That is what a half-done
    // edit looks like, and what every entry being commented out during a
    // bisect looks like — "not configured", not "configured wrongly".
    const result = parse(
      'title:\ndescription:\nnav:\nexclude:\ndefaultType:\n',
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ exclude: [] });
  });

  it('rejects a nav that refers to itself', () => {
    // A YAML anchor pointing at its own parent is a finite document that
    // describes an infinite tree. The recursive schema would follow it until
    // the stack ran out, and "Maximum call stack size exceeded" names neither
    // the file nor the field.
    expect(() =>
      parse('nav: &sections\n  - title: Guides\n    children: *sections\n'),
    ).not.toThrow();
    expect(messages('nav: &s\n  - title: G\n    children: *s\n')).toMatch(
      /refers to itself/,
    );
  });

  it('names a misspelled top-level key instead of ignoring it', () => {
    // `navigation:` silently stripped means the author's carefully ordered
    // nav is simply not applied, and the build is green.
    expect(messages('navigation:\n  - page: a.md\n')).toMatch(/navigation/);
  });

  it('names a misspelled key inside a nav entry', () => {
    expect(
      messages('nav:\n  - page: a.md\n    childre:\n      - page: b.md\n'),
    ).toMatch(/childre/);
  });

  it('requires a nav entry to carry a page or a title', () => {
    expect(messages('nav:\n  - {}\n')).toMatch(/page or a title/);
  });

  it('accepts a well-formed file', () => {
    const result = parse(
      'title: Docs\ndefaultType: how-to\nexclude:\n  - drafts/**\nnav:\n  - title: Guides\n    children:\n      - page: guides/a.md\n',
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      title: 'Docs',
      defaultType: 'how-to',
      exclude: ['drafts/**'],
      nav: [{ title: 'Guides', children: [{ page: 'guides/a.md' }] }],
    });
  });
});
