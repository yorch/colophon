import { plainText } from './plainText';

/**
 * The search index is the only consumer. Chunks stay markdown everywhere else,
 * so these assert the one transformation and, just as importantly, that it
 * does not lose the words people search for.
 */
describe('plainText', () => {
  it('strips the syntax a reader should never see in a snippet', () => {
    const out = plainText(
      '## Chunking\n\nApplied at **index time**, see `maxChars`.\n',
    );
    expect(out).not.toMatch(/[#*`]/);
    expect(out).toContain('Chunking');
    expect(out).toContain('Applied at index time');
    expect(out).toContain('maxChars');
  });

  it('keeps a space between blocks', () => {
    // The reason this is not `mdast-util-to-string` over the whole tree: that
    // concatenates without separators, welding the last word of one block to
    // the first of the next into a token that matches no query.
    const out = plainText('# Chunking\n\nApplied at index time.\n');
    expect(out).not.toContain('ChunkingApplied');
    expect(out.split(/\s+/)).toContain('Chunking');
  });

  it('separates table cells instead of running them together', () => {
    const out = plainText(
      '| Key | Default |\n| --- | --- |\n| `maxChars` | `1500` |\n',
    );
    expect(out).not.toContain('|');
    expect(out).not.toContain('---');
    expect(out).not.toContain('maxChars1500');
    for (const word of ['Key', 'Default', 'maxChars', '1500']) {
      expect(out.split(/\s+/)).toContain(word);
    }
  });

  it('keeps the contents of fenced code blocks', () => {
    // Config keys and command names live in fences, and those are precisely
    // what someone types into a search box. Dropping them would make the
    // reference pages unsearchable by the thing they document.
    const out = plainText(
      'Configure it:\n\n```yaml\ncolophon:\n  storage:\n    type: s3\n```\n',
    );
    expect(out).not.toContain('```');
    expect(out).toContain('colophon:');
    expect(out).toContain('type: s3');
  });

  it('keeps link text and drops the URL', () => {
    const out = plainText('See [the architecture](./architecture.md) page.\n');
    expect(out).toContain('the architecture');
    expect(out).not.toContain('architecture.md');
  });

  it('flattens list items individually', () => {
    const out = plainText('- first item\n- second item\n');
    expect(out).not.toContain('-');
    expect(out).not.toContain('first itemsecond item');
  });

  it('survives an empty chunk', () => {
    expect(plainText('')).toBe('');
    expect(plainText('   \n\n')).toBe('');
  });
});
