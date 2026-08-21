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
