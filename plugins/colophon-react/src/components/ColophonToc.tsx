import { Text } from '@backstage/ui';
import type { Heading } from '@brnby/colophon-common';
import { useColophonStyles } from '../styles';
import { useActiveHeading } from '../useActiveHeading';

export interface ColophonTocProps {
  headings: Heading[];
  /** Deepest heading level to show. Deeper headings are noise in a sidebar. */
  maxDepth?: number;
  label?: string;
  /**
   * The title the page header shows. See {@link tocEntries}: it decides which
   * level-1 heading is the title (omitted from the list) and which are body
   * headings the renderer demoted to level 2 (kept, as level 2).
   */
  pageTitle?: string;
  /**
   * `sidebar` (default) is the always-open list for a side column.
   *
   * `disclosure` is the same list collapsed behind an "On this page" summary,
   * for placing at the top of the content column. It is shown only while the sidebar column
   * is not (a container narrower than 64rem), so a page never has both and the
   * links are never duplicated for a screen reader. It must sit inside the
   * `colophon-layout-container` for that query to have a container to ask.
   */
  variant?: 'sidebar' | 'disclosure';
}

const normalise = (text: string) =>
  text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The headings a table of contents lists, with the renderer's demotion applied.
 *
 * The page header is the one `h1`, so ColophonMarkdown draws the FIRST body
 * `h1` as the title duplicate when it repeats `pageTitle` (dropped), and every
 * other body `h1` as an `h2`. The manifest records the authored depth, so the
 * same decision is made here from the same inputs — otherwise an `h1` that the
 * page shows as a section would be missing from its own table of contents.
 * Without a `pageTitle` the first `h1` is taken to be the title, as before.
 */
export function tocEntries(
  headings: Heading[],
  maxDepth = 3,
  pageTitle?: string,
): Heading[] {
  let seenH1 = false;
  const entries: Heading[] = [];
  for (const heading of headings) {
    if (heading.depth === 1) {
      const first = !seenH1;
      seenH1 = true;
      const isTitle =
        first &&
        (!pageTitle || normalise(heading.text) === normalise(pageTitle));
      if (!isTitle) {
        entries.push({ ...heading, depth: 2 });
      }
    } else {
      entries.push(heading);
    }
  }
  return entries.filter(h => h.depth <= maxDepth);
}

/**
 * On-page table of contents.
 *
 * The page title is not listed, because the header already renders it and a
 * table of contents that repeated it would just be the page's own name.
 */
export function ColophonToc({
  headings,
  maxDepth = 3,
  label = 'On this page',
  pageTitle,
  variant = 'sidebar',
}: ColophonTocProps) {
  useColophonStyles();
  const shown = tocEntries(headings, maxDepth, pageTitle);
  const active = useActiveHeading(shown.map(h => h.anchor));
  if (shown.length === 0) {
    return null;
  }
  const list = (
    <ul className="colophon-toc-list">
      {shown.map(heading => (
        <li
          key={heading.anchor}
          style={{
            paddingInlineStart: `calc(var(--bui-space-3) * ${heading.depth - 2})`,
          }}
        >
          {/* A plain anchor, not the routed BUI Link: an in-page jump
                should be the browser's native scroll, not a navigation that
                the router resolves against the current path. */}
          <a
            className="colophon-toc-link"
            href={`#${heading.anchor}`}
            aria-current={active === heading.anchor ? 'location' : undefined}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
  if (variant === 'disclosure') {
    return (
      <nav aria-label={label} className="colophon-toc colophon-toc-disclosure">
        <details>
          <summary>{label}</summary>
          {list}
        </details>
      </nav>
    );
  }
  return (
    <nav aria-label={label} className="colophon-toc">
      <Text variant="body-small" weight="bold" color="secondary" as="div">
        {label}
      </Text>
      {list}
    </nav>
  );
}
