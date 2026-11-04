/**
 * GitHub-style callouts: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`
 * and `[!CAUTION]`.
 *
 * Authors write these because GitHub renders them, so a repository's docs
 * already contain them — and without this step they surface as a grey quote
 * with a literal `[!NOTE]` in it. It is a remark plugin rather than a
 * component override because a blockquote override receives rendered children
 * and would have to dig the marker out of React elements; here it is still a
 * text node.
 *
 * The plugin only DESCRIBES the output (`hName`/`hProperties`); what survives
 * to the DOM is decided afterwards by the sanitiser, whose schema allows
 * exactly the `aside`, the role and the class names emitted here and nothing
 * else. No `unist-util-visit`: it is not a dependency of this package, and the
 * walk is ten lines.
 */

export const CALLOUT_KINDS = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

const LABELS: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

// The marker must open the quote's first line; `[!NOTE] text` on one line is
// accepted too, as GitHub does.
const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n)?/i;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

export function remarkCallouts() {
  return (tree: MdNode) => {
    walk(tree);
  };
}

function walk(node: MdNode): void {
  for (const child of node.children ?? []) {
    walk(child);
  }
  if (node.type === 'blockquote') {
    convert(node);
  }
}

function convert(quote: MdNode): void {
  const paragraph = quote.children?.[0];
  const text = paragraph?.children?.[0];
  if (paragraph?.type !== 'paragraph' || text?.type !== 'text') {
    return;
  }
  const match = MARKER.exec(text.value ?? '');
  if (!match || !paragraph.children) {
    return;
  }
  const kind = match[1].toLowerCase() as CalloutKind;

  const rest = (text.value ?? '').slice(match[0].length);
  if (rest) {
    text.value = rest;
  } else {
    paragraph.children.shift();
  }
  if (paragraph.children.length === 0) {
    quote.children?.shift();
  }

  quote.data = {
    ...quote.data,
    hName: 'aside',
    hProperties: {
      className: ['colophon-callout', `colophon-callout-${kind}`],
      role: 'note',
    },
  };
  // A real element with real text, not CSS `content:`, so the label is
  // selectable and is announced.
  quote.children?.unshift({
    type: 'paragraph',
    data: {
      hName: 'div',
      hProperties: { className: ['colophon-callout-title'] },
    },
    children: [{ type: 'text', value: LABELS[kind] }],
  });
}
