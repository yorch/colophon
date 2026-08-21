import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import type { NavNode } from '@brnby/colophon-common';
import { screen, within } from '@testing-library/react';
import { ColophonNav } from './ColophonNav';

const nodes: NavNode[] = [
  { title: 'Overview', slug: '' },
  {
    title: 'Guides',
    children: [
      { title: 'Deploying', slug: 'guides/deploy' },
      {
        title: 'Operations',
        slug: 'guides/ops',
        children: [
          { title: 'Rotating credentials', slug: 'guides/ops/credentials' },
        ],
      },
    ],
  },
];

const hrefForSlug = (slug: string) => `/docs/${slug}`;

describe('ColophonNav', () => {
  it('renders nested nodes at every depth', async () => {
    await renderInTestApp(
      <ColophonNav nodes={nodes} hrefForSlug={hrefForSlug} />,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/docs/',
    );
    expect(screen.getByRole('link', { name: 'Deploying' })).toHaveAttribute(
      'href',
      '/docs/guides/deploy',
    );
    // Third level, which only appears if the tree recurses through a node that
    // has both a slug and children.
    expect(
      screen.getByRole('link', { name: 'Rotating credentials' }),
    ).toHaveAttribute('href', '/docs/guides/ops/credentials');
  });

  it('renders a node without a slug as a group header, not a link', async () => {
    await renderInTestApp(
      <ColophonNav nodes={nodes} hrefForSlug={hrefForSlug} />,
    );

    expect(screen.getByText('Guides')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Guides' })).toBeNull();
  });

  it('nests the children of a group inside that group list item', async () => {
    await renderInTestApp(
      <ColophonNav nodes={nodes} hrefForSlug={hrefForSlug} />,
    );

    const groupItem = screen.getByText('Guides').closest('li');
    expect(groupItem).not.toBeNull();
    expect(
      within(groupItem as HTMLElement).getByRole('link', { name: 'Deploying' }),
    ).toBeInTheDocument();
  });

  it('marks the active slug as the current page', async () => {
    await renderInTestApp(
      <ColophonNav
        nodes={nodes}
        activeSlug="guides/deploy"
        hrefForSlug={hrefForSlug}
      />,
    );

    expect(screen.getByRole('link', { name: 'Deploying' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('renders nothing at all for an empty tree', async () => {
    const { container } = await renderInTestApp(
      <ColophonNav nodes={[]} hrefForSlug={hrefForSlug} />,
    );

    expect(container.querySelector('nav')).toBeNull();
  });
});
