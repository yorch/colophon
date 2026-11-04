---
'@brnby/plugin-colophon': minor
'@brnby/plugin-colophon-react': minor
'@brnby/plugin-colophon-backend': minor
---

UX, layout and accessibility pass across the docs home, the reader and search.

**Search (fix).** Results showed raw `<uuid>` highlight tags and highlights
that landed mid-word. Backstage's Lunr engine keys documents on `location`,
and the collator emitted several chunks per section that all shared one
anchor, so match positions from one chunk were spliced into another chunk's
text. The collator now emits one search document per section. Diagram fences
(mermaid, plantuml, dot, d2) are no longer indexed, table rows index as one
line with cells joined by ` · `, and ordinary code stays searchable.
Results are clamped to three lines, show which bundle they belong to, and
never render unknown markup. Search results are coarser (a result lands on a
section rather than a chunk), so reindex after upgrading.

**Docs home and reader.**

- Content has side margins, and bundle cards navigate without reloading the
  app. The home page has a heading, a repository count, a stable sort and each
  bundle's last update.
- The version picker moved out of the collapsed menu into the main column and
  now has a visible focus ring. The Pages menu closes after choosing a page.
- Unknown versions, bundles and pages now get distinct, friendly states with a
  way out, and other errors offer Retry instead of a raw status message.
  Loading states are announced to assistive technology.
- Added a skip link, a breadcrumb and a per-page document title.
- The side navigation now appears at 48rem of container width and the table of
  contents at 64rem, down from 56rem and 72rem. Below 64rem an "On this page"
  disclosure replaces the sidebar. The current section is highlighted while
  scrolling, and headings no longer land flush against the viewport edge.

**Rendering.**

- A body `# Title` that repeats the page title is dropped and any other
  top-level heading is demoted to `h2`, so each page has one `h1` and the
  headings step down in size.
- GitHub-style callouts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`,
  `[!CAUTION]`) render as labelled asides. Deprecated and draft pages are now
  visibly distinct, and deprecated pages get a banner.
- A Mermaid diagram that fails to parse no longer leaks an error graphic onto
  the page; it falls back to its source and a short message.
- Code blocks gain a language label and a copy button. Wide code and tables
  get an edge fade and become keyboard-focusable only when they overflow.
  Headings get a link-to-section anchor.
- Added the missing `:focus-visible` styles on navigation, table of contents,
  body links and the version picker, and raised light-theme contrast for
  inline code and table headers.
- Callout and banner styles moved off deprecated `@backstage/ui` tokens.
