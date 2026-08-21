import { splitFrontmatter } from '@brnby/colophon-common';
import GithubSlugger from 'github-slugger';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { chunkPage } from './chunker';

/**
 * The publisher validates heading anchors, and the backend cuts chunks that
 * deep links point at. If the two ever disagree about where a page's body
 * starts or how an anchor is slugified, the publisher blesses links to
 * anchors the backend never produces — and nothing fails loudly, the links
 * simply go nowhere.
 *
 * The CLI lives in a separate package that this one must not depend on, so
 * rather than importing it, this mirrors its algorithm exactly and asserts
 * the two stay in step. If this file is edited to make a test pass, the
 * publisher must be edited to match.
 */
function publisherAnchors(markdown: string): string[] {
  const { body } = splitFrontmatter(markdown);
  const root = unified().use(remarkParse).use(remarkGfm).parse(body);
  const slugger = new GithubSlugger();
  const anchors: string[] = [];
  for (const node of root.children) {
    if (node.type === 'heading') {
      anchors.push(slugger.slug(mdastToString(node).trim()));
    }
  }
  return anchors;
}

function backendAnchors(markdown: string): string[] {
  return chunkPage(
    { title: 'Page', markdown },
    {
      splitDepths: [1, 2, 3, 4, 5, 6],
      maxChars: 100000,
      minChars: 0,
      overlapChars: 0,
    },
  )
    .map(chunk => chunk.anchor)
    .filter((anchor): anchor is string => Boolean(anchor));
}

const long = 'body '.repeat(60).trim();

describe('publisher and backend agree on anchors', () => {
  it.each([
    [
      'plain frontmatter',
      `---\ntitle: T\n---\n\n## One\n\n${long}\n\n### Two\n\n${long}`,
    ],
    ['no frontmatter', `## One\n\n${long}\n\n## Two\n\n${long}`],
    ['CRLF', `---\r\ntitle: T\r\n---\r\n\r\n## One\r\n\r\n${long}`],
    ['byte order mark', `﻿---\ntitle: T\n---\n\n## One\n\n${long}`],
    ['duplicate headings', `## Setup\n\n${long}\n\n## Setup\n\n${long}`],
    ['punctuation', `## Rotate DB Credentials!\n\n${long}`],
    ['unicode', `## Café déjà vu\n\n${long}`],
    ['inline code in heading', `## The \`--strict\` flag\n\n${long}`],
    ['link in heading', `## See [docs](x.md)\n\n${long}`],
    [
      'horizontal rule in body',
      `---\ntitle: T\n---\n\n## One\n\n---\n\n${long}`,
    ],
    [
      'unterminated frontmatter',
      // Neither may treat this as frontmatter, or they disagree on the body.
      `---\ntitle: T\n--- trailing\n\n## One\n\n${long}`,
    ],
    [
      'indented rule inside a block scalar',
      `---\ndesc: |\n  a\n  ----\n  b\n---\n\n## One\n\n${long}`,
    ],
  ])('%s', (_name, markdown) => {
    expect(backendAnchors(markdown)).toEqual(publisherAnchors(markdown));
  });
});
