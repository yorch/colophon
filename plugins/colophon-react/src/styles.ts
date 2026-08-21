/**
 * Prose styling for rendered markdown.
 *
 * Injected once as a stylesheet rather than expressed as inline styles because
 * prose needs descendant selectors — `li > p`, `table th`, `blockquote` — that
 * inline styles cannot express. Every value is a Backstage UI design token, so
 * light and dark themes both follow the app without a second rule set.
 */
export const COLOPHON_STYLE_ELEMENT_ID = 'colophon-markdown-styles';

export const colophonMarkdownStyles = `
.colophon-markdown {
  color: var(--bui-fg-primary);
  font-family: var(--bui-font-regular);
  font-size: var(--bui-font-size-4);
  line-height: 1.65;
  overflow-wrap: break-word;
}
.colophon-markdown > *:first-child { margin-block-start: 0; }
.colophon-markdown > *:last-child { margin-block-end: 0; }
.colophon-markdown p { margin-block: var(--bui-space-3); }
.colophon-markdown ul,
.colophon-markdown ol { margin-block: var(--bui-space-3); padding-inline-start: var(--bui-space-6); }
.colophon-markdown li { margin-block: var(--bui-space-1); }
.colophon-markdown li > p { margin-block: 0; }
.colophon-markdown li.task-list-item { list-style: none; margin-inline-start: calc(-1 * var(--bui-space-5)); }
.colophon-markdown li.task-list-item input { margin-inline-end: var(--bui-space-2); }
.colophon-markdown hr { border: 0; border-block-start: 1px solid var(--bui-border-1); margin-block: var(--bui-space-6); }
.colophon-markdown blockquote {
  margin-block: var(--bui-space-4);
  margin-inline: 0;
  padding-inline-start: var(--bui-space-4);
  border-inline-start: 2px solid var(--bui-border-2);
  color: var(--bui-fg-secondary);
}
.colophon-markdown table { border-collapse: collapse; width: 100%; font-size: var(--bui-font-size-3); }
.colophon-markdown th,
.colophon-markdown td {
  border: 1px solid var(--bui-border-1);
  padding: var(--bui-space-2) var(--bui-space-3);
  text-align: start;
}
.colophon-markdown th { background: var(--bui-bg-neutral-2); font-weight: var(--bui-font-weight-bold); }
.colophon-markdown-table-scroll { overflow-x: auto; margin-block: var(--bui-space-4); }
.colophon-markdown-image { max-width: 100%; height: auto; border-radius: var(--bui-radius-2); }
.colophon-code-inline {
  font-family: var(--bui-font-monospace);
  font-size: 0.9em;
  background: var(--bui-bg-neutral-2);
  border-radius: var(--bui-radius-1);
  padding: 0.1em 0.35em;
}
.colophon-code-block {
  font-family: var(--bui-font-monospace);
  font-size: var(--bui-font-size-3);
  line-height: 1.6;
  background: var(--bui-bg-neutral-2);
  border: 1px solid var(--bui-border-1);
  border-radius: var(--bui-radius-2);
  padding: var(--bui-space-3) var(--bui-space-4);
  margin-block: var(--bui-space-4);
  overflow-x: auto;
}
.colophon-code-block code { font: inherit; background: none; padding: 0; }
.colophon-mermaid { margin-block: var(--bui-space-4); text-align: center; }
.colophon-mermaid svg { max-width: 100%; height: auto; }
.colophon-nav-list { list-style: none; margin: 0; padding: 0; }
.colophon-nav-list .colophon-nav-list { padding-inline-start: var(--bui-space-4); }
.colophon-toc-list { list-style: none; margin: 0; padding: 0; }
.colophon-toc-link {
  color: var(--bui-fg-secondary);
  font-size: var(--bui-font-size-3);
  text-decoration: none;
}
.colophon-toc-link:hover { color: var(--bui-fg-primary); text-decoration: underline; }
`;

/**
 * Adds the stylesheet to the document exactly once.
 *
 * Idempotent by element id so that rendering many `ColophonMarkdown` instances
 * — a search-results page renders one per hit — does not accumulate style tags.
 */
export function ensureColophonStyles(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(COLOPHON_STYLE_ELEMENT_ID)) {
    return;
  }
  const element = document.createElement('style');
  element.id = COLOPHON_STYLE_ELEMENT_ID;
  element.textContent = colophonMarkdownStyles;
  document.head.appendChild(element);
}
