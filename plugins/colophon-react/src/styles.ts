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

/**
 * The cascade layer every rule below is emitted into.
 *
 * Exported so an app can name it in its own `@layer` statement and choose
 * where it sits, without hardcoding the string. Later layers win, so the
 * order to write depends on which side should — see the customisation guide
 * rather than copying an example from here.
 */
export const COLOPHON_STYLE_LAYER = 'colophon';

/**
 * Container widths, in rem, at which the layout changes shape.
 *
 * Exported because the same two numbers are needed on both sides of the
 * stylesheet: the `@container` conditions below, and any JavaScript that
 * mirrors them (the docs browser closes the Pages disclosure below the nav
 * breakpoint). They used to be written out twice — 48rem here, 56rem there —
 * and in the gap between them the nav's summary was hidden by CSS while
 * script had already closed its <details>, leaving no way to open it.
 */
export const NAV_BREAKPOINT_REM = 48;
export const TOC_BREAKPOINT_REM = 64;

/**
 * Everything is inside `@layer colophon` because this stylesheet arrives LAST.
 *
 * It is appended to `<head>` when the first Colophon component mounts, which
 * for a lazily-loaded route is after the app's own stylesheets — so on a
 * specificity tie, order decided it and Colophon won. That is backwards for a
 * library: the app should win by default. Layered rules lose to every
 * unlayered rule regardless of specificity or order, so `.my-app p` and even
 * a bare `p` now beat `.colophon-markdown p` with nothing to configure.
 *
 * The cost is the same rule read the other way: an app with an aggressive
 * unlayered reset now beats this sheet too. `@layer colophon` in the app's
 * own CSS, ordered where it wants, is the fix.
 *
 * Cascade layers ship everywhere the container queries below already require
 * (Chrome 99 / Firefox 97 / Safari 15.4, all older than container-query
 * support), so this adds no browser floor. Container queries and
 * `prefers-reduced-motion` nest inside a layer unchanged — a layer scopes
 * the cascade, not matching.
 */
export const colophonMarkdownStyles = `
@layer ${COLOPHON_STYLE_LAYER} {
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
/* A task list drops its bullets, so the list's own indent would leave the
 * checkboxes floating in a gutter with nothing in it — and the previous
 * negative margin pushed them out past the column's left edge instead. The
 * list loses the indent rather than the items gaining a negative one; a list
 * NESTED under a task item gets it back, so children still read as children.
 * (:has is widely available; where it is not, the worst case is the old
 * indent.) */
.colophon-markdown li.task-list-item { list-style: none; }
.colophon-markdown :is(ul, ol):has(> li.task-list-item) { padding-inline-start: 0; }
.colophon-markdown li.task-list-item :is(ul, ol) { padding-inline-start: var(--bui-space-6); }
.colophon-markdown li.task-list-item input { margin-inline: 0 var(--bui-space-2); vertical-align: middle; }
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
  border: 1px solid var(--bui-border-2);
  padding: var(--bui-space-2) var(--bui-space-3);
  text-align: start;
}
/* In the light theme bg-neutral-2 (#f7f7f7) sits within a hair of the page
 * (#f5f5f5), so a header that relied on its fill alone was invisible; the
 * heavier rule below it is what actually separates head from body. */
.colophon-markdown th {
  background: var(--bui-bg-neutral-2);
  font-weight: var(--bui-font-weight-bold);
  border-block-end-width: 2px;
}
.colophon-markdown-table-scroll { overflow-x: auto; margin-block: var(--bui-space-4); }
.colophon-markdown-image { max-width: 100%; height: auto; border-radius: var(--bui-radius-2); }

/* Body links. In-page anchors share this with routed links (rendered by
 * Backstage UI), so they read as the same thing: coloured by the theme's
 * primary text, underlined. They were previously styled as ToC entries. */
.colophon-link {
  color: var(--bui-fg-primary);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
.colophon-link:hover { text-decoration-thickness: 2px; }

/* The one focus indicator, shared so every focusable thing in the renderer
 * looks the same. --bui-ring is the only focus token Backstage UI defines
 * (see the note on the bundle row below). */
.colophon-markdown a:focus-visible,
.colophon-link:focus-visible,
.colophon-nav-list a:focus-visible,
.colophon-toc-link:focus-visible,
.colophon-toc-disclosure > details > summary:focus-visible,
.colophon-nav-disclosure > summary:focus-visible,
.colophon-code-copy:focus-visible,
.colophon-heading-anchor:focus-visible,
.colophon-scroll:focus-visible,
.colophon-channel-picker :is(button, [role='combobox']):focus-visible {
  outline: 2px solid var(--bui-ring);
  outline-offset: 2px;
}
/* Nav and ToC links fill the width of a scroll container (overflow-y: auto
 * clips on the x axis too), so a ring drawn outside the box lost its sides.
 * Drawn inside instead, all four edges are visible. */
.colophon-nav-list a:focus-visible,
.colophon-toc-link:focus-visible { outline-offset: -2px; }

/* Skip link: off-screen until it takes focus, then pinned top-left above the
 * app chrome. Clipped rather than moved with a negative offset so it never
 * contributes to horizontal scroll in a right-to-left app. */
.colophon-skip-link {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.colophon-skip-link:focus,
.colophon-skip-link:focus-visible {
  position: fixed;
  top: var(--bui-space-2);
  left: var(--bui-space-2);
  z-index: 1000;
  width: auto;
  height: auto;
  overflow: visible;
  clip-path: none;
  padding: var(--bui-space-2) var(--bui-space-3);
  background: var(--bui-bg-neutral-1);
  color: var(--bui-fg-primary);
  border: 1px solid var(--bui-border-2);
  border-radius: var(--bui-radius-2);
  outline: 2px solid var(--bui-ring);
  outline-offset: 2px;
}

/* The version picker is a Backstage UI Select, whose trigger is a <button>.
 * Its ring comes from the shared rule above (the 2px outline); BUI itself only
 * draws a 1px inset line. Nothing here wraps the picker's label in a second
 * ring — an earlier :focus-within rule on the wrapper did, and stacked two
 * outlines on one control. */

/* Surfaces: a border on every code surface, because the fill alone is
 * indistinguishable from the page in the light theme (#f7f7f7 on #f5f5f5).
 * Text on the fill is fg-primary, far above 4.5:1 in both themes. */
.colophon-code-inline {
  font-family: var(--bui-font-monospace);
  font-size: 0.9em;
  background: var(--bui-bg-neutral-2);
  border: 1px solid var(--bui-border-2);
  border-radius: var(--bui-radius-1);
  padding: 0.05em 0.35em;
}
.colophon-code {
  margin-block: var(--bui-space-4);
  border: 1px solid var(--bui-border-2);
  border-radius: var(--bui-radius-2);
  background: var(--bui-bg-neutral-2);
  overflow: hidden;
}
.colophon-code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bui-space-2);
  padding: var(--bui-space-1) var(--bui-space-2) var(--bui-space-1) var(--bui-space-4);
  border-block-end: 1px solid var(--bui-border-1);
  font-size: var(--bui-font-size-2);
  color: var(--bui-fg-secondary);
}
/* fg-primary, not the bar's fg-secondary: secondary on neutral-2 is 3.24:1 in
 * the dark theme at 12px. Primary is 19.6:1 light and 8.2:1 dark. */
.colophon-code-language { font-family: var(--bui-font-monospace); text-transform: lowercase; color: var(--bui-fg-primary); }
.colophon-code-copy {
  margin-inline-start: auto;
  min-height: 1.75rem;
  padding: 0 var(--bui-space-2);
  border: 1px solid var(--bui-border-2);
  border-radius: var(--bui-radius-1);
  background: var(--bui-bg-neutral-1);
  color: var(--bui-fg-primary);
  font: inherit;
  cursor: pointer;
}
.colophon-code-copy:hover { background: var(--bui-bg-neutral-3); }
.colophon-code-block {
  font-family: var(--bui-font-monospace);
  font-size: var(--bui-font-size-3);
  line-height: 1.6;
  padding: var(--bui-space-3) var(--bui-space-4);
  margin: 0;
  overflow-x: auto;
}
.colophon-code-block code { font: inherit; background: none; border: 0; padding: 0; }
/* A code block outside .colophon-code (the mermaid fallback, or an override
 * that renders the bare class) still gets a box of its own. */
.colophon-mermaid .colophon-code-block {
  background: var(--bui-bg-neutral-2);
  border: 1px solid var(--bui-border-2);
  border-radius: var(--bui-radius-2);
  text-align: start;
}

/* Scroll cue. The data attributes are set by useScrollEdges only while there
 * is content hidden past that edge, so a box that fits shows no fade at all.
 * A mask rather than an overlay gradient because it needs no knowledge of the
 * background behind it (a table sits on the page, code on a fill). The
 * -webkit- form is still the only one Safari before 15.4 reads. Physical
 * left/right: scroll direction is horizontal in the physical sense, and
 * right-to-left documents are not handled. */
.colophon-scroll[data-fade-end]:not([data-fade-start]) {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
}
.colophon-scroll[data-fade-start]:not([data-fade-end]) {
  -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 2rem), transparent);
  mask-image: linear-gradient(to left, #000 calc(100% - 2rem), transparent);
}
.colophon-scroll[data-fade-start][data-fade-end] {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 2rem, #000 calc(100% - 2rem), transparent);
  mask-image: linear-gradient(to right, transparent, #000 2rem, #000 calc(100% - 2rem), transparent);
}

.colophon-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ------------------------------------------------------------- headings --
 * The page's own title is rendered by ColophonPageHeader as the h1 at
 * title-large. Body headings step down from it (h2 title-medium ... see
 * HEADING_VARIANTS), and the space above a heading shrinks with its level so
 * that rank is visible in the rhythm as well as in the size. h4 to h6 used
 * to share the paragraph margin and so ran into the text above them.
 */
.colophon-heading {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: var(--bui-space-2);
  margin-block: var(--bui-space-6) var(--bui-space-2);
}
.colophon-heading-2 { margin-block-start: var(--bui-space-8); }
.colophon-heading-3 { margin-block-start: var(--bui-space-6); }
.colophon-heading-4,
.colophon-heading-5,
.colophon-heading-6 { margin-block-start: var(--bui-space-5); }
/* Directly stacked headings (a section that opens with a subsection) should
 * not carry the full gap of a section break. */
.colophon-heading + .colophon-heading { margin-block-start: var(--bui-space-3); }
.colophon-markdown > :is(h1, h2, h3, h4, h5, h6),
.colophon-heading > :is(h1, h2, h3, h4, h5, h6) {
  margin: 0;
  /* Headings reached by an anchor or the table of contents otherwise land
   * flush against the top of the viewport. */
  scroll-margin-top: var(--bui-space-8);
}
/* h5 and h6 share the body size (see HEADING_VARIANTS): a heading smaller than
 * the text under it reads as a caption. h6 is set apart by colour, which is
 * passed to the Text component rather than overridden here — this sheet is
 * layered, and BUI's own unlayered rules would win. */
.colophon-heading-anchor {
  color: var(--bui-fg-secondary);
  text-decoration: none;
  opacity: 0;
  padding-inline: var(--bui-space-1);
}
.colophon-heading:hover .colophon-heading-anchor,
.colophon-heading-anchor:focus-visible { opacity: 1; }
/* There is no hover on a touch screen, so the affordance would never appear.
 * Hover capability is a property of the device, not of the container, which
 * is why this is one of the few @media rules in the sheet. */
@media (hover: none) {
  .colophon-heading-anchor { opacity: 0.6; }
}

/* ------------------------------------------------------------- callouts --
 * GitHub-style admonitions (see remarkCallouts). Every colour pair is a
 * Backstage UI "-on-bg" foreground on its own background, which the tokens
 * guarantee for both themes: the title text is >= 4.5:1 in each (checked
 * against the shipped token values, light and dark). Body text stays
 * fg-primary on the tinted background. The kind is carried by the label and
 * the border, never by colour alone.
 */
.colophon-callout {
  --colophon-callout-bg: var(--bui-announcement-bg-subdued);
  --colophon-callout-border: var(--bui-announcement-border);
  --colophon-callout-fg: var(--bui-announcement-fg-subdued);
  margin-block: var(--bui-space-4);
  padding: var(--bui-space-3) var(--bui-space-4);
  background: var(--colophon-callout-bg);
  border: 1px solid var(--colophon-callout-border);
  border-inline-start-width: 4px;
  border-radius: var(--bui-radius-2);
  color: var(--bui-fg-primary);
}
.colophon-callout-tip {
  --colophon-callout-bg: var(--bui-positive-bg-subdued);
  --colophon-callout-border: var(--bui-positive-border);
  --colophon-callout-fg: var(--bui-positive-fg-subdued);
}
/* Backstage UI has four semantic families and a note already takes the blue
 * one, so IMPORTANT is told apart by being the neutral one: a raised surface
 * with the theme's accent as its rule and primary-coloured title. Accent
 * against neutral-2 is 7.1:1 light and 4.8:1 dark for the rule; the title is
 * fg-primary (19.6:1 / 8.2:1). */
.colophon-callout-important {
  --colophon-callout-bg: var(--bui-bg-neutral-2);
  --colophon-callout-border: var(--bui-accent-bg);
  --colophon-callout-fg: var(--bui-fg-primary);
}
.colophon-callout-warning {
  --colophon-callout-bg: var(--bui-warning-bg-subdued);
  --colophon-callout-border: var(--bui-warning-border);
  --colophon-callout-fg: var(--bui-warning-fg-subdued);
}
.colophon-callout-caution {
  --colophon-callout-bg: var(--bui-negative-bg-subdued);
  --colophon-callout-border: var(--bui-negative-border);
  --colophon-callout-fg: var(--bui-negative-fg-subdued);
}
.colophon-callout-title {
  color: var(--colophon-callout-fg);
  font-weight: var(--bui-font-weight-bold);
  margin-block: 0 var(--bui-space-1);
}
.colophon-callout > :nth-child(2) { margin-block-start: 0; }
.colophon-callout > :last-child { margin-block-end: 0; }

/* ------------------------------------------------------------- mermaid --- */
.colophon-mermaid { margin-block: var(--bui-space-4); text-align: center; }
.colophon-mermaid svg { max-width: 100%; height: auto; }
/* Reserves room while the (lazy, half-megabyte) library loads, so the page
 * does not jump when the diagram arrives. */
.colophon-mermaid-pending { min-height: 8rem; display: grid; place-items: center; }
/* The failure case shows source, which reads left-aligned; the centring above
 * is for diagrams. */
.colophon-mermaid-fallback { text-align: start; margin-inline: 0; }
.colophon-mermaid-fallback figcaption { margin-block-start: var(--bui-space-2); }

/* ------------------------------------------------------------ navigation --
 * Rows are at least 2rem (32px) tall; they were ~24px, too small a target for
 * a list that is the main way around the docs. */
.colophon-nav-list { list-style: none; margin: 0; padding: 0; }
.colophon-nav-list .colophon-nav-list { padding-inline-start: var(--bui-space-3); }
/* Group headers and links share one inline padding. They used to differ
 * (0 versus the link's padding), so a header sat further left than the
 * links beneath it. */
.colophon-nav-list a,
.colophon-nav-group {
  display: flex;
  align-items: center;
  min-height: 2rem;
  padding: var(--bui-space-1) var(--bui-space-2);
  /* Reserved on every row so the active one does not shift; logical so it
   * sits on the correct side in a right-to-left app. */
  border-inline-start: 2px solid transparent;
}
.colophon-nav-list a {
  border-radius: var(--bui-radius-1);
  text-decoration: none;
}
.colophon-nav-list a:hover,
.colophon-nav-list a:focus-visible { background: var(--bui-bg-neutral-1); }
/* Styled off aria-current rather than a class of its own, so the thing a
 * screen reader announces and the thing a sighted reader sees cannot drift
 * apart — there is only one source for "this is the page you are on". */
.colophon-nav-list a[aria-current='page'] {
  background: var(--bui-bg-neutral-2);
  border-inline-start-color: var(--bui-accent-bg);
}
.colophon-toc-list { list-style: none; margin: 0; padding: 0; }
.colophon-toc-list > li { margin-block: var(--bui-space-1); }
.colophon-toc-link {
  display: flex;
  align-items: center;
  min-height: 2rem;
  padding-block: var(--bui-space-1);
  padding-inline: var(--bui-space-2);
  border-inline-start: 2px solid transparent;
  color: var(--bui-fg-secondary);
  font-size: var(--bui-font-size-3);
  line-height: 1.4;
  text-decoration: none;
}
.colophon-toc-link:hover,
.colophon-toc-link:focus-visible { color: var(--bui-fg-primary); text-decoration: underline; }
/* "You are here". Not colour alone: the weight and the rule change too. The
 * rule is a logical border that every item already reserves, so activating one
 * moves nothing sideways (it used to add padding) and is correct in RTL (a
 * physical inset shadow was not). */
.colophon-toc-link[aria-current='location'] {
  color: var(--bui-fg-primary);
  font-weight: var(--bui-font-weight-bold);
  border-inline-start-color: var(--bui-accent-bg);
}
/* Pointer type is a property of the device, not of the container, so this is
 * deliberately an @media rule (the other being prefers-reduced-motion): a
 * finger needs ~40px however wide the box it is tapping in happens to be. */
@media (pointer: coarse) {
  .colophon-nav-list a,
  .colophon-nav-group,
  .colophon-toc-link { min-height: 2.5rem; }
  .colophon-code-copy { min-height: 2.25rem; }
}

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

/* A grid item's min-width defaults to auto, so a wide table or code line would
 * stretch the column past the container instead of scrolling in its own box. */
.colophon-layout-main { min-width: 0; }

/* One column below this: the page navigation collapses into a disclosure,
 * because a fixed 16rem of it leaves too little for the prose it exists to
 * lead people to. 48rem leaves ~32rem for prose beside the 16rem nav; the
 * previous 56rem collapsed it on ordinary laptop-width entity tabs.
 *
 * The collapsed side is written as \`not (min-width: ...)\` rather than
 * \`max-width\` at the same value: both bounds are inclusive, so at exactly
 * the breakpoint a min and a max rule would match together. Negating the one
 * query guarantees every width matches exactly one side. */
@container (min-width: ${NAV_BREAKPOINT_REM}rem) {
  .colophon-layout { grid-template-columns: 16rem minmax(0, 1fr); }
}

/* The table of contents is the first thing to go, and the last to come back:
 * it is an aid for finding your place in a page, while the navigation is how
 * you reach the page at all. Below this width it moves above the content as
 * the "On this page" disclosure (ColophonToc variant="disclosure"). */
@container (min-width: ${TOC_BREAKPOINT_REM}rem) {
  .colophon-layout { grid-template-columns: 16rem minmax(0, 1fr) 14rem; }
}
.colophon-layout-toc { display: none; }
@container (min-width: ${TOC_BREAKPOINT_REM}rem) {
  .colophon-layout-toc { display: block; }
  .colophon-toc-disclosure { display: none; }
}
/* A page with no headings renders no table of contents, but its column used
 * to be reserved anyway: 14rem of nothing beside the prose. Collapse the
 * column when nothing in it is a ToC. */
.colophon-layout-toc:not(:has(.colophon-toc)) { display: none; }
@container (min-width: ${TOC_BREAKPOINT_REM}rem) {
  .colophon-layout:has(> .colophon-layout-toc:not(:has(.colophon-toc))) {
    grid-template-columns: 16rem minmax(0, 1fr);
  }
}

/* Both disclosures (Pages, On this page) are one control to the reader, so they
 * share one summary: same chevron, same compact size. They used to differ — a
 * native triangle on one and a hamburger glyph on the other — and each was a
 * full-width bar before the page had said what it was. */
.colophon-toc-disclosure { margin-block-end: var(--bui-space-3); }
.colophon-toc-disclosure > details > summary,
.colophon-nav-disclosure > summary {
  display: flex;
  align-items: center;
  gap: var(--bui-space-2);
  min-height: 2rem;
  cursor: pointer;
  padding: var(--bui-space-1) var(--bui-space-3);
  border: 1px solid var(--bui-border-2);
  border-radius: var(--bui-radius-2);
  font-size: var(--bui-font-size-3);
  font-weight: var(--bui-font-weight-bold);
  color: var(--bui-fg-primary);
  list-style: none;
}
.colophon-toc-disclosure > details > summary::-webkit-details-marker,
.colophon-nav-disclosure > summary::-webkit-details-marker { display: none; }
.colophon-toc-disclosure > details > summary::before,
.colophon-nav-disclosure > summary::before {
  content: '\\25B8';
  display: inline-block;
  font-size: 0.85em;
}
.colophon-toc-disclosure > details[open] > summary::before,
.colophon-nav-disclosure[open] > summary::before { transform: rotate(90deg); }
/* The chevron points toward the end of the line, so it turns around with it. */
.colophon-toc-disclosure > details > summary:dir(rtl)::before,
.colophon-nav-disclosure > summary:dir(rtl)::before { transform: scaleX(-1); }
.colophon-toc-disclosure > details[open] > summary:dir(rtl)::before,
.colophon-nav-disclosure[open] > summary:dir(rtl)::before { transform: scaleX(-1) rotate(90deg); }
.colophon-toc-disclosure > details[open] > summary,
.colophon-nav-disclosure[open] > summary { margin-block-end: var(--bui-space-2); }

/* Where the ToC disclosure and the version picker sit, at the top of the
 * content column. In the content column rather than above the layout: between
 * the nav and ToC breakpoints the disclosure spanned the nav's column too, and
 * on a phone it stacked above Pages, the thing a reader reaches for first. */
.colophon-layout-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--bui-space-2) var(--bui-space-3);
}
.colophon-layout-toolbar > .colophon-toc-disclosure { flex: 1 1 12rem; min-width: 0; }
.colophon-layout-toolbar-picker { margin-inline-start: auto; margin-block-end: var(--bui-space-3); }

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
@container not (min-width: ${NAV_BREAKPOINT_REM}rem) {
  .colophon-layout-nav { position: static; max-height: none; overflow: visible; }
}

/* Above the breakpoint the disclosure is always open and its control is
 * meaningless, so it is removed rather than merely hidden — a summary that
 * cannot change anything should not be reachable by keyboard either. */
@container (min-width: ${NAV_BREAKPOINT_REM}rem) {
  .colophon-nav-disclosure > summary { display: none; }
}

/* ------------------------------------------------------------- measure --
 * Prose only. Tables and diagrams are deliberately exempt: they carry their
 * own scroll container and are the one kind of content that benefits from
 * every pixel available.
 */
.colophon-markdown > :is(p, ul, ol, blockquote, aside, .colophon-heading, h1, h2, h3, h4, h5, h6) {
  max-width: 72ch;
}

/* ------------------------------------------------------- page header ---- */
.colophon-page-header {
  padding-block-end: var(--bui-space-4);
  margin-block-end: var(--bui-space-6);
  border-block-end: 1px solid var(--bui-border-1);
}
/* Backstage UI badges carry no status styling at all, so deprecated and draft
 * looked identical to the type badge beside them. Deprecated takes the warning
 * pair (text >= 4.5:1 on its own background in both themes); draft stays
 * neutral but dashed so the two are told apart without implying a warning. */
.colophon-status[data-status='deprecated'] > * {
  background: var(--bui-warning-bg-subdued);
  color: var(--bui-warning-fg-subdued);
  border: 1px solid var(--bui-warning-border);
}
.colophon-status[data-status='draft'] > * {
  border: 1px dashed var(--bui-border-2);
}
.colophon-banner {
  padding: var(--bui-space-2) var(--bui-space-3);
  border-radius: var(--bui-radius-2);
  font-size: var(--bui-font-size-3);
}
.colophon-banner-warning {
  background: var(--bui-warning-bg-subdued);
  color: var(--bui-warning-fg-subdued);
  border: 1px solid var(--bui-warning-border);
}
.colophon-external-glyph { font-size: 0.85em; }

/* ---------------------------------------------------------------- rows --- */
.colophon-bundle-row {
  position: relative;
  padding: var(--bui-space-4);
  border: 1px solid var(--bui-border-1);
  border-radius: var(--bui-radius-3);
  background: var(--bui-bg-neutral-1);
}
/* Hover and keyboard focus look the same, so the row answers a Tab the way it
 * answers a pointer. */
.colophon-bundle-row:hover,
.colophon-bundle-row:focus-within { border-color: var(--bui-border-2); background: var(--bui-bg-neutral-2); }
/* --bui-ring is the only token Backstage UI defines for a focus indicator, and
 * it is the one that survives a theme swap. An earlier revision named
 * --bui-fg-link, which does not exist in @backstage/ui at all — so the outline
 * resolved to nothing and keyboard users got no focus indicator here.
 * styles.test.tsx now checks every token named here against the stylesheet
 * @backstage/ui actually ships, because nothing else fails when one is wrong. */
.colophon-bundle-row:focus-within { outline: 2px solid var(--bui-ring); outline-offset: 2px; }
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
.colophon-bundle-row:hover .colophon-bundle-row-link,
.colophon-bundle-row-link:focus-visible { text-decoration: underline; }
/* The row already draws the focus indicator around the whole card; the link's
 * own outline would be a second ring inside it. Exactly one indicator is
 * visible, and it is the row's. */
.colophon-bundle-row-link:focus,
.colophon-bundle-row-link:focus-visible { outline: none; }

/* ----------------------------------------------------------- skeleton ---
 * A shaped placeholder rather than the word "Loading": it reserves the space
 * the content will occupy, so arrival does not shift everything below it.
 * neutral-3 rather than neutral-2: in the light theme neutral-2 is within a
 * hair of the page and the shapes could not be seen. The pulse never goes
 * below 0.5 for the same reason.
 */
.colophon-skeleton {
  background: var(--bui-bg-neutral-3);
  border: 1px solid var(--bui-border-1);
  border-radius: var(--bui-radius-1);
  animation: colophon-pulse 1.4s ease-in-out infinite;
}
.colophon-skeleton-page,
.colophon-skeleton-nav { display: grid; gap: var(--bui-space-3); }
.colophon-skeleton-title { height: 2rem; width: 55%; }
.colophon-skeleton-line { height: 1rem; }
.colophon-skeleton-block { height: 8rem; width: 100%; }
@keyframes colophon-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) {
  .colophon-skeleton { animation: none; }
}
}
`;

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

/**
 * Adds the stylesheet to the document exactly once.
 *
 * Idempotent by element id so that rendering many `ColophonMarkdown` instances
 * — a search-results page renders one per hit — does not accumulate style tags.
 *
 * That id is {@link COLOPHON_STYLE_ELEMENT_ID}, and it is also the opt-out: an
 * app that puts its own `<style>` under that id before Colophon renders keeps
 * injection from ever happening, because this function only checks whether the
 * id is taken.
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
