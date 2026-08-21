import { chunkPage } from './chunker';

/**
 * Property tests over generated corpora, complementing the example-based
 * suite next door.
 *
 * The generator is a seeded LCG rather than Math.random so a failure is
 * reproducible from the seed alone — a chunking bug that only appears for
 * one input shape is worthless if the next run cannot recreate it.
 */
function makeRandom(seed: number): (bound: number) => number {
  let state = seed;
  return bound => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
}

const OPTIONS = {
  splitDepths: [2, 3],
  maxChars: 600,
  minChars: 150,
  overlapChars: 0,
};

function corpus(rnd: (bound: number) => number): {
  markdown: string;
  tokens: string[];
} {
  const parts: string[] = [];
  const tokens: string[] = [];
  for (let i = 0; i < 1 + rnd(10); i++) {
    if (rnd(3) === 0) {
      parts.push(`${'#'.repeat(2 + rnd(2))} Heading ${i}`);
    }
    const token = `tok${i}`;
    tokens.push(token);
    parts.push(`${token} ${'x'.repeat(20 + rnd(400))}`);
  }
  return { markdown: parts.join('\n\n'), tokens };
}

describe('chunker properties', () => {
  it('never loses content', () => {
    // Chunking is lossy only in the sense of adding boundaries; every token
    // of the page must still be retrievable from some chunk.
    const rnd = makeRandom(987);
    for (let trial = 0; trial < 200; trial++) {
      const { markdown, tokens } = corpus(rnd);
      const joined = chunkPage({ title: 'T', markdown }, OPTIONS)
        .map(chunk => chunk.text)
        .join(' ');
      for (const token of tokens) {
        expect(joined).toContain(token);
      }
    }
  });

  it('never emits the same heading in two chunks', () => {
    // A duplicated heading means the merge logic re-inserted one it had
    // already carried, which is how a page ends up out of order.
    const rnd = makeRandom(4242);
    for (let trial = 0; trial < 200; trial++) {
      const { markdown } = corpus(rnd);
      const headings = chunkPage({ title: 'T', markdown }, OPTIONS).flatMap(
        chunk => chunk.text.match(/^#{2,3} Heading \d+/gm) ?? [],
      );
      expect(new Set(headings).size).toBe(headings.length);
    }
  });

  it('respects maxChars except for a single unsplittable block', () => {
    // The ceiling is soft by contract: slicing through a fenced block or a
    // table row produces a chunk worse than an oversized one. But a chunk
    // made of SEVERAL blocks has no such excuse.
    const rnd = makeRandom(31337);
    for (let trial = 0; trial < 200; trial++) {
      const maxChars = 200 + rnd(1200);
      const parts: string[] = [];
      for (let i = 0; i < 1 + rnd(12); i++) {
        if (rnd(6) === 0) {
          parts.push(`## H${i}`);
        }
        parts.push('w'.repeat(1 + rnd(Math.floor(maxChars * 1.5))));
      }
      const chunks = chunkPage(
        { title: 'T', markdown: parts.join('\n\n') },
        { ...OPTIONS, maxChars, minChars: 0 },
      );
      for (const chunk of chunks) {
        if (chunk.text.length > maxChars) {
          expect(chunk.text.split('\n\n').filter(Boolean)).toHaveLength(1);
        }
      }
    }
  });

  it('numbers chunks contiguously from zero, whatever the shape', () => {
    const rnd = makeRandom(5150);
    for (let trial = 0; trial < 100; trial++) {
      const { markdown } = corpus(rnd);
      const ordinals = chunkPage({ title: 'T', markdown }, OPTIONS).map(
        chunk => chunk.ordinal,
      );
      expect(ordinals).toEqual(ordinals.map((_, index) => index));
    }
  });

  it('always heads a breadcrumb with the page title', () => {
    const rnd = makeRandom(272);
    for (let trial = 0; trial < 100; trial++) {
      const { markdown } = corpus(rnd);
      for (const chunk of chunkPage(
        { title: 'Page Title', markdown },
        OPTIONS,
      )) {
        expect(chunk.breadcrumb[0]).toBe('Page Title');
      }
    }
  });
});
