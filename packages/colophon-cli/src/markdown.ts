import type { Heading } from '@brnby/colophon-common';
import GithubSlugger from 'github-slugger';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Reference } from './types';

const parser = unified().use(remarkParse).use(remarkGfm);

/** Just enough of an mdast node to walk it — avoids depending on the
 * `mdast` types package for a single recursive function. */
interface AstNode {
  type: string;
  url?: string;
  children?: AstNode[];
  position?: { start?: { line?: number } };
}

/** Recursive walk for link/image nodes — small enough not to warrant the
 * unist-util-visit dependency this package does not otherwise need. */
function collectReferences(
  node: AstNode,
  into: Reference[],
  lineOffset: number,
): void {
  if (
    (node.type === 'link' || node.type === 'image') &&
    node.url !== undefined
  ) {
    into.push({
      url: node.url,
      kind: node.type,
      line:
        node.position?.start?.line === undefined
          ? undefined
          : node.position.start.line + lineOffset,
    });
  }
  for (const child of node.children ?? []) {
    collectReferences(child, into, lineOffset);
  }
}

export interface ParsedPage {
  headings: Heading[];
  references: Reference[];
}

/**
 * Parses a page body (frontmatter already stripped) into its headings and
 * its link/image references, in one pass over the AST.
 *
 * `lineOffset` is how many lines the frontmatter occupied. Positions from the
 * parser are relative to the body it was handed, so without the offset every
 * reported line would be short by the length of the frontmatter — a wrong
 * line number being considerably worse than none.
 *
 * Anchors use a FRESH `GithubSlugger` per page, matching the backend
 * chunker's own slugger exactly: duplicate headings within a page get
 * GitHub's `-1`, `-2` suffixes, but the same heading text in two different
 * pages independently starts from the bare slug. A link validated here must
 * resolve to the same anchor the chunker derives at index time.
 */
export function parsePage(markdown: string, lineOffset = 0): ParsedPage {
  const root = parser.parse(markdown);
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  for (const node of root.children) {
    if (node.type === 'heading') {
      const text = mdastToString(node).trim();
      headings.push({ depth: node.depth, text, anchor: slugger.slug(text) });
    }
  }
  const references: Reference[] = [];
  collectReferences(root as AstNode, references, lineOffset);
  return { headings, references };
}
