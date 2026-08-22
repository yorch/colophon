import { useEffect } from 'react';

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
.colophon-nav-list .colophon-nav-list { padding-inline-start: var(--bui-space-3); }
.colophon-nav-list a {
  display: block;
  padding: var(--bui-space-1) var(--bui-space-2);
  border-radius: var(--bui-radius-1);
  text-decoration: none;
}
.colophon-nav-list a:hover { background: var(--bui-bg-neutral-1); }
/* Styled off aria-current rather than a class of its own, so the thing a
 * screen reader announces and the thing a sighted reader sees cannot drift
 * apart — there is only one source for "this is the page you are on". */
.colophon-nav-list a[aria-current='page'] {
  background: var(--bui-bg-neutral-2);
  box-shadow: inset 2px 0 0 var(--bui-fg-link);
}
.colophon-toc-list { list-style: none; margin: 0; padding: 0; }
.colophon-toc-link {
  color: var(--bui-fg-secondary);
  font-size: var(--bui-font-size-3);
  text-decoration: none;
}
.colophon-toc-link:hover { color: var(--bui-fg-primary); text-decoration: underline; }

/* ---------------------------------------------------------------- layout --
 * CONTAINER queries, not media queries. The same browser renders at full
 * page width and inside an entity tab, where the catalog's own chrome takes
 * a large share — so viewport width says nothing useful about how much room
 * this component actually has. Asking the container is the only way both
 * placements get the layout they can afford.
 */
.colophon-layout-container { container-type: inline-size; }

.colophon-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bui-space-6);
  align-items: start;
}

/* One column below this: the page navigation collapses into a disclosure,
 * because a fixed 16rem of it leaves too little for the prose it exists to
 * lead people to. */
@container (min-width: 56rem) {
  .colophon-layout { grid-template-columns: 16rem minmax(0, 1fr); }
}

/* The table of contents is the first thing to go, and the last to come back:
 * it is an aid for finding your place in a page, while the navigation is how
 * you reach the page at all. */
@container (min-width: 72rem) {
  .colophon-layout { grid-template-columns: 16rem minmax(0, 1fr) 14rem; }
}
.colophon-layout-toc { display: none; }
@container (min-width: 72rem) {
  .colophon-layout-toc { display: block; }
}

/* Sticky so that a long page does not strand the reader with no way to move
 * between pages without scrolling back up. Both scroll independently once
 * they outgrow the viewport. */
.colophon-layout-nav,
.colophon-layout-toc {
  position: sticky;
  top: var(--bui-space-4);
  max-height: calc(100vh - var(--bui-space-8));
  overflow-y: auto;
}
@container (max-width: 56rem) {
  .colophon-layout-nav { position: static; max-height: none; overflow: visible; }
}

.colophon-nav-disclosure > summary {
  cursor: pointer;
  padding: var(--bui-space-2) var(--bui-space-3);
  border: 1px solid var(--bui-border-1);
  border-radius: var(--bui-radius-2);
  font-size: var(--bui-font-size-3);
  font-weight: var(--bui-font-weight-bold);
  color: var(--bui-fg-primary);
  list-style: none;
}
.colophon-nav-disclosure > summary::-webkit-details-marker { display: none; }
.colophon-nav-disclosure > summary::before { content: '\\2261'; margin-inline-end: var(--bui-space-2); }
.colophon-nav-disclosure[open] > summary { margin-block-end: var(--bui-space-3); }
/* Above the breakpoint the disclosure is always open and its control is
 * meaningless, so it is removed rather than merely hidden — a summary that
 * cannot change anything should not be reachable by keyboard either. */
@container (min-width: 56rem) {
  .colophon-nav-disclosure > summary { display: none; }
}

/* ------------------------------------------------------------- measure --
 * Prose only. Tables and diagrams are deliberately exempt: they carry their
 * own scroll container and are the one kind of content that benefits from
 * every pixel available.
 */
.colophon-markdown > :is(p, ul, ol, blockquote, h1, h2, h3, h4, h5, h6) {
  max-width: 72ch;
}

/* ---------------------------------------------------------------- rows --- */
.colophon-bundle-row {
  position: relative;
  padding: var(--bui-space-4);
  border: 1px solid var(--bui-border-1);
  border-radius: var(--bui-radius-3);
  background: var(--bui-bg-surface-1);
}
.colophon-bundle-row:hover { border-color: var(--bui-border-2); background: var(--bui-bg-neutral-1); }
.colophon-bundle-row:focus-within { outline: 2px solid var(--bui-fg-link); outline-offset: 2px; }
/* The title is the link; this stretches its hit area over the whole row.
 * Wrapping the row in an anchor instead would make the row's entire text —
 * title, description and bundle id — the link's accessible name, which is
 * what a screen reader would then read out as its label. */
.colophon-bundle-row-link { color: inherit; text-decoration: none; }
.colophon-bundle-row-link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.colophon-bundle-row:hover .colophon-bundle-row-link { text-decoration: underline; }

/* ----------------------------------------------------------- skeleton ---
 * A shaped placeholder rather than the word "Loading": it reserves the space
 * the content will occupy, so arrival does not shift everything below it.
 */
.colophon-skeleton {
  background: var(--bui-bg-neutral-2);
  border-radius: var(--bui-radius-1);
  animation: colophon-pulse 1.4s ease-in-out infinite;
}
@keyframes colophon-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) {
  .colophon-skeleton { animation: none; }
}
`;

/**
 * Adds the stylesheet to the document exactly once.
 *
 * Idempotent by element id so that rendering many `ColophonMarkdown` instances
 * — a search-results page renders one per hit — does not accumulate style tags.
 */
/**
 * React binding for {@link ensureColophonStyles}.
 *
 * Every component that emits a `colophon-` class calls this, rather than
 * relying on one of them having been rendered first. The stylesheet used to
 * be injected only by the markdown renderer, which was invisible until it
 * grew rules for layout and list rows — surfaces that appear on pages where
 * no markdown is rendered at all, and which therefore came out unstyled.
 *
 * Idempotent and cheap: one lookup by element id.
 */
export function useColophonStyles(): void {
  useEffect(() => ensureColophonStyles(), []);
}

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
