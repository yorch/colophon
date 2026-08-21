import { chunkPage } from './chunker';

const opts = (over: Partial<Parameters<typeof chunkPage>[1]> = {}) => ({
  splitDepths: [2, 3],
  maxChars: 1500,
  minChars: 200,
  overlapChars: 0,
  ...over,
});

/** Comfortably longer than the default 200-char minChars, so a test about
 * splitting is never quietly testing the merge rule instead. */
const body = (label: string) => `${label} `.repeat(150).trim();

describe('splitting', () => {
  it('starts a chunk at each configured heading depth', () => {
    const chunks = chunkPage(
      {
        title: 'Page',
        markdown: `## One\n\n${body('a')}\n\n## Two\n\n${body('b')}`,
      },
      opts(),
    );
    expect(chunks.map(c => c.anchor)).toEqual(['one', 'two']);
  });

  it('splits on h3 as well, because reference pages put one option per h3', () => {
    const chunks = chunkPage(
      {
        title: 'Page',
        markdown: `## Options\n\n${body('x')}\n\n### First\n\n${body('y')}\n\n### Second\n\n${body('z')}`,
      },
      opts(),
    );
    expect(chunks.map(c => c.anchor)).toEqual(['options', 'first', 'second']);
  });

  it('does not split at a depth that is not configured', () => {
    const chunks = chunkPage(
      {
        title: 'Page',
        markdown: `## One\n\n${body('a')}\n\n### Nested\n\n${body('b')}`,
      },
      opts({ splitDepths: [2] }),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('### Nested');
  });

  it('keeps a preamble before the first heading as its own anchorless chunk', () => {
    const chunks = chunkPage(
      {
        title: 'Page',
        markdown: `${body('intro')}\n\n## After\n\n${body('a')}`,
      },
      opts(),
    );
    expect(chunks[0].anchor).toBeUndefined();
    expect(chunks[0].text).toContain('intro');
  });

  it('numbers chunks contiguously from zero', () => {
    const chunks = chunkPage(
      {
        title: 'Page',
        markdown: `## A\n\n${body('a')}\n\n## B\n\n${body('b')}\n\n## C\n\n${body('c')}`,
      },
      opts(),
    );
    expect(chunks.map(c => c.ordinal)).toEqual([0, 1, 2]);
  });
});

describe('code fences', () => {
  it('never splits inside a fenced block that contains headings', () => {
    // A fence full of "## " lines is the case that would silently corrupt
    // every agent answer if the splitter worked on raw text.
    const markdown = [
      '## Real',
      '',
      body('a'),
      '',
      '```markdown',
      '## Not a heading',
      '',
      '### Also not a heading',
      '```',
      '',
      '## Second',
      '',
      body('b'),
    ].join('\n');

    const chunks = chunkPage({ title: 'Page', markdown }, opts());
    expect(chunks.map(c => c.anchor)).toEqual(['real', 'second']);
    const first = chunks.find(c => c.anchor === 'real');
    expect(first?.text).toContain('## Not a heading');
    expect(first?.text).toContain('### Also not a heading');
  });

  it('keeps a fence verbatim rather than reformatting it', () => {
    const markdown = `## Code\n\n\`\`\`ts\nconst x = {  a:1 };\n\`\`\`\n\n${body('a')}`;
    const chunks = chunkPage({ title: 'Page', markdown }, opts());
    expect(chunks[0].text).toContain('const x = {  a:1 };');
  });

  it('emits an oversized fence alone rather than cutting through it', () => {
    const huge = 'x'.repeat(3000);
    const markdown = `## Big\n\n\`\`\`\n${huge}\n\`\`\``;
    const chunks = chunkPage(
      { title: 'Page', markdown },
      opts({ maxChars: 500 }),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain(huge);
  });
});

describe('breadcrumbs', () => {
  it('heads every trail with the page title', () => {
    const chunks = chunkPage(
      { title: 'Payments API', markdown: `## Ops\n\n${body('a')}` },
      opts(),
    );
    expect(chunks[0].breadcrumb[0]).toBe('Payments API');
  });

  it('accumulates ancestor headings', () => {
    const chunks = chunkPage(
      {
        title: 'Payments API',
        markdown: `## Operations\n\n${body('a')}\n\n### Rotating credentials\n\n${body('b')}`,
      },
      opts(),
    );
    const deep = chunks.find(c => c.anchor === 'rotating-credentials');
    expect(deep?.breadcrumb).toEqual([
      'Payments API',
      'Operations',
      'Rotating credentials',
    ]);
  });

  it('does not repeat an h1 that merely restates the page title', () => {
    const chunks = chunkPage(
      {
        title: 'Deploy',
        markdown: `# Deploy\n\n${body('intro')}\n\n## Steps\n\n${body('a')}`,
      },
      opts(),
    );
    const steps = chunks.find(c => c.anchor === 'steps');
    expect(steps?.breadcrumb).toEqual(['Deploy', 'Steps']);
  });

  it('pops back out when a sibling heading follows a nested one', () => {
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `## A\n\n${body('a')}\n\n### A1\n\n${body('b')}\n\n## B\n\n${body('c')}`,
      },
      opts(),
    );
    expect(chunks.find(c => c.anchor === 'b')?.breadcrumb).toEqual(['P', 'B']);
  });
});

describe('anchors', () => {
  it('matches github-slugger, including punctuation and case', () => {
    const chunks = chunkPage(
      { title: 'P', markdown: `## Rotating DB Credentials!\n\n${body('a')}` },
      opts(),
    );
    expect(chunks[0].anchor).toBe('rotating-db-credentials');
  });

  it('suffixes duplicate headings within one page', () => {
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `## Setup\n\n${body('a')}\n\n## Setup\n\n${body('b')}`,
      },
      opts(),
    );
    expect(chunks.map(c => c.anchor)).toEqual(['setup', 'setup-1']);
  });

  it('consumes a slug for a non-splitting heading, so suffixes still line up', () => {
    // H4 does not start a chunk, but it still takes "detail"; the H2 that
    // repeats it must therefore be "detail-1" — exactly what the manifest's
    // heading anchors, produced by the same slugger, will say.
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `## Top\n\n${body('a')}\n\n#### Detail\n\n${body(
          'b',
        )}\n\n## Detail\n\n${body('c')}`,
      },
      opts(),
    );
    expect(chunks.map(c => c.anchor)).toEqual(['top', 'detail-1']);
  });
});

describe('nesting', () => {
  it('leaves headings deeper than the split depths inside the chunk body', () => {
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `## Two\n\n${body('a')}\n\n#### Four\n\n${body(
          'b',
        )}\n\n##### Five\n\n${body('c')}`,
      },
      opts(),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].anchor).toBe('two');
    expect(chunks[0].text).toContain('#### Four');
    expect(chunks[0].text).toContain('##### Five');
  });

  it('treats a depth above the shallowest split depth as a split too', () => {
    // Splitting on h3 alone must not glue an entire h2 section onto the
    // preceding one; anything shallower than the shallowest split depth
    // starts a chunk as well.
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `## A\n\n${body('a')}\n\n### A1\n\n${body(
          'b',
        )}\n\n## B\n\n${body('c')}`,
      },
      opts({ splitDepths: [3] }),
    );
    expect(chunks.map(c => c.anchor)).toEqual(['a', 'a1', 'b']);
  });

  it('emits the whole page as one chunk when no depth splits', () => {
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `## A\n\n${body('a')}\n\n## B\n\n${body('b')}`,
      },
      opts({ splitDepths: [], maxChars: 100_000 }),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].anchor).toBeUndefined();
  });
});

describe('size rules', () => {
  it('splits an over-long section on block boundaries', () => {
    const para = 'word '.repeat(120).trim();
    const markdown = `## Long\n\n${para}\n\n${para}\n\n${para}`;
    const chunks = chunkPage({ title: 'P', markdown }, opts({ maxChars: 700 }));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text).not.toMatch(/word wor$/);
    }
  });

  it('cuts only between paragraphs, never inside one', () => {
    // Every paragraph is a distinct sentence, so any chunk that ends
    // mid-sentence proves the splitter cut through a block.
    const paragraphs = Array.from(
      { length: 6 },
      (_unused, index) => `${`Sentence ${index} `.repeat(30).trim()}.`,
    );
    const chunks = chunkPage(
      { title: 'P', markdown: `## Long\n\n${paragraphs.join('\n\n')}` },
      opts({ maxChars: 600 }),
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.endsWith('.')).toBe(true);
    }
    // Nothing may be lost or duplicated in the process.
    expect(chunks.flatMap(c => c.text.split('\n\n'))).toEqual(paragraphs);
  });

  it('emits a single paragraph over the ceiling whole rather than slicing it', () => {
    // The ceiling is soft by contract: an oversized chunk retrieves worse
    // than a small one, but a chunk cut mid-sentence retrieves wrongly.
    const paragraph = 'word '.repeat(600).trim();
    const chunks = chunkPage(
      { title: 'P', markdown: `## Long\n\n${paragraph}` },
      opts({ maxChars: 500 }),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(paragraph);
  });

  it('merges a stub section into the one that follows', () => {
    const chunks = chunkPage(
      { title: 'P', markdown: `## Stub\n\nShort.\n\n## Real\n\n${body('a')}` },
      opts(),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Short.');
  });

  it('keeps the following section identity when merging, so deep links land', () => {
    const chunks = chunkPage(
      { title: 'P', markdown: `## Stub\n\nShort.\n\n## Real\n\n${body('a')}` },
      opts(),
    );
    expect(chunks[0].anchor).toBe('real');
  });

  it('re-inserts a merged stub heading, so its wording is still searchable', () => {
    const chunks = chunkPage(
      { title: 'P', markdown: `## Stub\n\nShort.\n\n## Real\n\n${body('a')}` },
      opts(),
    );
    expect(chunks[0].text).toContain('## Stub');
  });

  it('omits the stub heading when the next section nests beneath it', () => {
    // The breadcrumb of the nested section already names the parent, so
    // repeating it in the body is noise an agent has to read past.
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `## Parent\n\nShort.\n\n### Child\n\n${body('a')}`,
      },
      opts(),
    );
    expect(chunks[0].breadcrumb).toEqual(['P', 'Parent', 'Child']);
    expect(chunks[0].text).not.toContain('## Parent');
    expect(chunks[0].text).toContain('Short.');
  });

  it('emits merged content in document order, however many stubs run together', () => {
    // Regression: chained merges used to re-insert each stub's heading in
    // front of everything already carried, so a page of short sections came
    // back with its headings reversed and detached from their own prose.
    const markdown = [
      '## Operations',
      '',
      'Operations intro.',
      '',
      '### Rotating credentials',
      '',
      'Rotate like so.',
      '',
      '### Revoking credentials',
      '',
      'Revoke like so.',
      '',
      '## Limits',
      '',
      'Some limits.',
    ].join('\n');

    const chunks = chunkPage({ title: 'P', markdown }, opts());
    expect(chunks).toHaveLength(1);
    // "Limits" is the surviving identity, so it is named by the breadcrumb
    // rather than repeated in the body; every heading merged INTO it is.
    expect(chunks[0].breadcrumb).toEqual(['P', 'Limits']);
    expect(chunks[0].text.split('\n\n')).toEqual([
      'Operations intro.',
      '### Rotating credentials',
      'Rotate like so.',
      '### Revoking credentials',
      'Revoke like so.',
      'Some limits.',
    ]);
  });

  it('appends a trailing stub after the chunk it merges back into', () => {
    // Nothing follows it, so it merges backwards — but it must land at the
    // END of that chunk, not in front of the content already there.
    const chunks = chunkPage(
      { title: 'P', markdown: `## Real\n\n${body('a')}\n\n## Tail\n\nBye.` },
      opts(),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toMatch(/## Tail\n\nBye\.$/);
    expect(chunks[0].text.indexOf('a a a')).toBeLessThan(
      chunks[0].text.indexOf('## Tail'),
    );
  });
});

describe('overlap', () => {
  /** One section long enough that the size ceiling splits it. */
  const longSection = (label: string, paragraphs: number) =>
    `## ${label}\n\n${Array.from({ length: paragraphs }, (_, i) => `${label}${i} ${body(label)}`).join('\n\n')}`;

  const withOverlap = (markdown: string, overlapChars = 40) =>
    chunkPage({ title: 'P', markdown }, opts({ maxChars: 400, overlapChars }));

  it('repeats the tail of the previous chunk across a split', () => {
    // A split inside one section falls wherever the ceiling landed, so the
    // cut is arbitrary and the repetition restores what it removed. The
    // repeated text is the END of the previous chunk, not its beginning.
    const chunks = withOverlap(longSection('alpha', 4));
    expect(chunks.length).toBeGreaterThan(1);
    const [repeated] = chunks[1].text.split('\n\n');
    expect(chunks[0].text.endsWith(repeated)).toBe(true);
  });

  it('starts the overlap at a word boundary rather than mid-word', () => {
    const chunks = withOverlap(longSection('alpha', 4));
    expect(chunks[1].text).not.toMatch(/^\s/);
    expect(chunks[1].text.split(/\s/)[0]).not.toBe('');
  });

  it('does not begin a chunk with a stray blank line', () => {
    // The tail must consume the whole whitespace run, not one character of
    // it, or a paragraph break leaves its second newline behind.
    for (const chunk of withOverlap(longSection('alpha', 6))) {
      expect(chunk.text).toBe(chunk.text.trimStart());
    }
  });

  it('does not compound overlap down a long section', () => {
    // Overlap comes from the previous chunk's own text, so the third chunk
    // carries a tail of the second only.
    const chunks = withOverlap(longSection('alpha', 8));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[2].text).not.toContain('alpha0 ');
  });

  it('resets at a heading, so a section never opens with the previous one', () => {
    // A chunk anchored at B carrying A's prose would have an agent cite A's
    // content under B's heading and deep link.
    const chunks = withOverlap(
      `## A\n\n${body('alpha')}\n\n## B\n\n${body('beta')}`,
    );
    const sectionB = chunks.find(chunk => chunk.anchor === 'b');
    expect(sectionB?.text).not.toContain('alpha');
    expect(sectionB?.text.startsWith('beta')).toBe(true);
  });

  it('leaves the first chunk of every section untouched', () => {
    const chunks = withOverlap(
      `## A\n\n${body('alpha')}\n\n## B\n\n${body('beta')}`,
    );
    expect(chunks.find(c => c.anchor === 'a')?.text).toBe(body('alpha'));
    expect(chunks.find(c => c.anchor === 'b')?.text).toBe(body('beta'));
  });

  it('changes nothing when overlap is off, which is the default', () => {
    const markdown = longSection('alpha', 4);
    expect(withOverlap(markdown, 0)).toEqual(
      chunkPage({ title: 'P', markdown }, opts({ maxChars: 400 })),
    );
  });
});

describe('degenerate input', () => {
  it('returns nothing for an empty page', () => {
    expect(chunkPage({ title: 'P', markdown: '' }, opts())).toEqual([]);
  });

  it('returns nothing for frontmatter with no body', () => {
    expect(
      chunkPage({ title: 'P', markdown: '---\ntitle: P\n---\n' }, opts()),
    ).toEqual([]);
  });

  it('strips frontmatter rather than reading it as a setext heading', () => {
    const chunks = chunkPage(
      {
        title: 'P',
        markdown: `---\ntitle: P\ndescription: d\n---\n\n## Real\n\n${body('a')}`,
      },
      opts(),
    );
    expect(chunks.map(c => c.anchor)).toEqual(['real']);
    expect(chunks[0].text).not.toContain('description:');
  });

  it('handles a page with no headings at all', () => {
    const chunks = chunkPage({ title: 'P', markdown: body('only') }, opts());
    expect(chunks).toHaveLength(1);
    expect(chunks[0].anchor).toBeUndefined();
  });

  it('handles headings with no content between them', () => {
    const chunks = chunkPage(
      { title: 'P', markdown: '## A\n\n## B\n\n## C' },
      opts(),
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(c => typeof c.text === 'string')).toBe(true);
  });

  it('gives every chunk a content hash', () => {
    const chunks = chunkPage(
      { title: 'P', markdown: `## A\n\n${body('a')}` },
      opts(),
    );
    expect(chunks[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic across runs', () => {
    const input = {
      title: 'P',
      markdown: `## A\n\n${body('a')}\n\n### B\n\n${body('b')}`,
    };
    expect(chunkPage(input, opts())).toEqual(chunkPage(input, opts()));
  });
});
