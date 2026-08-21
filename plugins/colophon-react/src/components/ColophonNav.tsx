import { Link, Text } from '@backstage/ui';
import type { NavNode } from '@brnby/colophon-common';

export interface ColophonNavProps {
  nodes: NavNode[];
  /** Slug of the page being viewed, highlighted in the tree. */
  activeSlug?: string;
  /** Builds the href for a page slug. */
  hrefForSlug: (slug: string) => string;
  /** Accessible name for the landmark. */
  label?: string;
}

/**
 * The bundle's navigation tree.
 *
 * Nodes without a `slug` are group headers with no page of their own, which is
 * how a `docs/` directory that has no `index.md` still appears in the tree.
 */
export function ColophonNav({
  nodes,
  activeSlug,
  hrefForSlug,
  label = 'Documentation',
}: ColophonNavProps) {
  if (nodes.length === 0) {
    return null;
  }
  return (
    <nav aria-label={label}>
      <NavList
        nodes={nodes}
        activeSlug={activeSlug}
        hrefForSlug={hrefForSlug}
      />
    </nav>
  );
}

function NavList({
  nodes,
  activeSlug,
  hrefForSlug,
}: Omit<ColophonNavProps, 'label'>) {
  return (
    <ul className="colophon-nav-list">
      {nodes.map(node => (
        // A group header has no slug, so its title is the only identity it has.
        <li key={node.slug ?? `group:${node.title}`}>
          <NavEntry
            node={node}
            activeSlug={activeSlug}
            hrefForSlug={hrefForSlug}
          />
          {node.children && node.children.length > 0 ? (
            <NavList
              nodes={node.children}
              activeSlug={activeSlug}
              hrefForSlug={hrefForSlug}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function NavEntry({
  node,
  activeSlug,
  hrefForSlug,
}: {
  node: NavNode;
  activeSlug?: string;
  hrefForSlug: (slug: string) => string;
}) {
  if (node.slug === undefined) {
    return (
      <Text variant="body-small" weight="bold" color="secondary" as="div">
        {node.title}
      </Text>
    );
  }
  const isActive = node.slug === activeSlug;
  return (
    <Link
      href={hrefForSlug(node.slug)}
      variant="body-small"
      weight={isActive ? 'bold' : 'regular'}
      color={isActive ? 'primary' : 'secondary'}
      aria-current={isActive ? 'page' : undefined}
    >
      {node.title}
    </Link>
  );
}
