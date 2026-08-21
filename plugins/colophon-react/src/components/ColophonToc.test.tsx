import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import type { Heading } from '@brnby/colophon-common';
import { screen } from '@testing-library/react';
import { ColophonToc } from './ColophonToc';

const headings: Heading[] = [
  { depth: 1, text: 'Payments API', anchor: 'payments-api' },
  { depth: 2, text: 'Operations', anchor: 'operations' },
  { depth: 3, text: 'Rotating credentials', anchor: 'rotating-credentials' },
  { depth: 4, text: 'Edge cases', anchor: 'edge-cases' },
];

describe('ColophonToc', () => {
  it('links each heading to its anchor', async () => {
    await renderInTestApp(<ColophonToc headings={headings} />);

    expect(screen.getByRole('link', { name: 'Operations' })).toHaveAttribute(
      'href',
      '#operations',
    );
    // A native anchor, not a routed link: react-router would otherwise resolve
    // the bare hash against the current path.
    expect(screen.getByRole('link', { name: 'Operations' })).toHaveClass(
      'colophon-toc-link',
    );
  });

  it('skips the page title and anything past maxDepth', async () => {
    await renderInTestApp(<ColophonToc headings={headings} />);

    expect(screen.queryByRole('link', { name: 'Payments API' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edge cases' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Rotating credentials' }),
    ).toBeInTheDocument();
  });

  it('honours a raised maxDepth', async () => {
    await renderInTestApp(<ColophonToc headings={headings} maxDepth={4} />);

    expect(
      screen.getByRole('link', { name: 'Edge cases' }),
    ).toBeInTheDocument();
  });

  it('renders nothing when no heading qualifies', async () => {
    const { container } = await renderInTestApp(
      <ColophonToc headings={[headings[0]]} />,
    );

    expect(container.querySelector('nav')).toBeNull();
  });
});
