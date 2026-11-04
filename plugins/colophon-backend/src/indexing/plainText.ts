import { toString as mdastToString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm);

/** Just enough of an mdast node to walk it. */
interface AstNode {
  type: string;
  value?: string;
  lang?: string | null;
  children?: AstNode[];
}

/**
 * Fences whose body is diagram source rather than text a reader types. A
 * mermaid block indexed verbatim becomes the snippet for its whole section,
 * which is the first thing a search result shows and says nothing about the
 * page. The MCP tools keep the source; search does not need it.
 */
const DIAGRAM_LANGUAGES = new Set(['mermaid', 'plantuml', 'dot', 'd2']);

/**
 * Blocks that are a unit of prose. Everything else is a container to descend
 * through, so a list item's paragraph becomes its own run of text.
 */
function collect(node: AstNode, into: string[]): void {
  switch (node.type) {
    case 'code': {
      if (DIAGRAM_LANGUAGES.has(node.lang?.toLowerCase() ?? '')) {
        return;
      }
      // Ordinary code is kept whole: config keys and command names live in
      // fences, and those are what someone types into a search box.
      if (node.value?.trim()) {
        into.push(node.value.trim());
      }
      return;
    }
    case 'tableRow': {
      // One line per row, cells joined with a visible separator. Cells on
      // their own lines collapse into a run-on sentence once a snippet is
      // rendered, and the separator is what keeps "Key" and "Default" apart.
      const cells = (node.children ?? [])
        .map(cell => mdastToString(cell).trim())
        .filter(text => text.length > 0);
      if (cells.length > 0) {
        into.push(cells.join(' · '));
      }
      return;
    }
    case 'paragraph':
    case 'heading': {
      const text = mdastToString(node).trim();
      if (text) {
        into.push(text);
      }
      return;
    }
    default:
      for (const child of node.children ?? []) {
        collect(child, into);
      }
  }
}

/**
 * Renders a markdown chunk as plain text, for the search index only.
 *
 * Chunks are stored as raw markdown because that is what the MCP tools serve —
 * an agent wants the table, not a flattened version of it. Backstage Search
 * has the opposite need: its result snippets are shown to a person, and raw
 * source puts `| --- | --- |`, backticks and `##` in front of them.
 *
 * Not `mdast-util-to-string` on the whole tree, which is the obvious approach
 * and produces `"ChunkingApplied at index timeKeyDefault"` — it concatenates
 * without separators, so every block boundary becomes a missing space and the
 * words either side are welded into a token that matches nothing.
 */
export function plainText(markdown: string): string {
  const parts: string[] = [];
  collect(parser.parse(markdown) as AstNode, parts);
  return parts.join('\n');
}
