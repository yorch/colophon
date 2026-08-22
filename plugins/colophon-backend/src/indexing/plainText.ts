import { toString as mdastToString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm);

/** Just enough of an mdast node to walk it. */
interface AstNode {
  type: string;
  value?: string;
  children?: AstNode[];
}

/**
 * Blocks that are a unit of prose. Everything else is a container to descend
 * through, so a list item's paragraph and a table's cells each become their
 * own run of text rather than one run of the whole structure.
 */
function collect(node: AstNode, into: string[]): void {
  switch (node.type) {
    case 'code':
      // Kept, not dropped: config keys and command names live in fenced
      // blocks, and those are exactly what someone types into a search box.
      if (node.value?.trim()) {
        into.push(node.value.trim());
      }
      return;
    case 'paragraph':
    case 'heading':
    case 'tableCell': {
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
