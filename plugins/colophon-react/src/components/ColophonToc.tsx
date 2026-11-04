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
   * `sidebar` (default) is the always-open list for a side column.
   *
   * `disclosure` is the same list collapsed behind an "On this page" summary,
   * for placing ABOVE the content. It is shown only while the sidebar column
   * is not (a container narrower than 64rem), so a page never has both and the
   * links are never duplicated for a screen reader. It must sit inside the
   * `colophon-layout-container` for that query to have a container to ask.
   */
  variant?: 'sidebar' | 'disclosure';
}

/**
 * On-page table of contents.
 *
 * `depth: 1` is skipped because the page title already renders it, so a
 * table of contents that repeated it would just be the page's own name.
 */
export function ColophonToc({
  headings,
  maxDepth = 3,
  label = 'On this page',
  variant = 'sidebar',
}: ColophonTocProps) {
  useColophonStyles();
  const shown = headings.filter(h => h.depth > 1 && h.depth <= maxDepth);
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
