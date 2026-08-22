import { Text } from '@backstage/ui';
import type { Heading } from '@brnby/colophon-common';
import { useColophonStyles } from '../styles';

export interface ColophonTocProps {
  headings: Heading[];
  /** Deepest heading level to show. Deeper headings are noise in a sidebar. */
  maxDepth?: number;
  label?: string;
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
}: ColophonTocProps) {
  useColophonStyles();
  const shown = headings.filter(h => h.depth > 1 && h.depth <= maxDepth);
  if (shown.length === 0) {
    return null;
  }
  return (
    <nav aria-label={label}>
      <Text variant="body-small" weight="bold" color="secondary" as="div">
        {label}
      </Text>
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
            <a className="colophon-toc-link" href={`#${heading.anchor}`}>
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
