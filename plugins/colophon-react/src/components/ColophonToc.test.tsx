import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import type { Heading } from '@brnby/colophon-common';
import { screen } from '@testing-library/react';
import { ColophonToc, tocEntries } from './ColophonToc';

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

describe('tocEntries', () => {
  const h = (depth: number, text: string): Heading => ({
    depth,
    text,
    anchor: text.toLowerCase().replace(/\s+/g, '-'),
  });

  it('drops the leading h1 that repeats the page title', () => {
    expect(
      tocEntries([h(1, 'Payments API'), h(2, 'Setup')], 3, 'Payments API'),
    ).toEqual([h(2, 'Setup')]);
  });

  it('keeps a body h1 that is not the title, as an h2-level entry', () => {
    const out = tocEntries(
      [h(1, 'Payments API'), h(2, 'Setup'), h(1, 'Appendix')],
      3,
      'Payments API',
    );
    expect(out.map(e => [e.text, e.depth])).toEqual([
      ['Setup', 2],
      ['Appendix', 2],
    ]);
  });

  it('drops only the first matching h1, not a later repeat of the title', () => {
    const out = tocEntries(
      [h(1, 'Payments API'), h(1, 'Payments API')],
      3,
      'Payments API',
    );
    expect(out.map(e => [e.text, e.depth])).toEqual([['Payments API', 2]]);
  });

  it('keeps an h1 that comes first but is not the title', () => {
    const out = tocEntries([h(1, 'Overview')], 3, 'Payments API');
    expect(out.map(e => [e.text, e.depth])).toEqual([['Overview', 2]]);
  });

  it('treats the first h1 as the title when no title is given', () => {
    expect(tocEntries([h(1, 'Anything'), h(2, 'Setup')])).toEqual([
      h(2, 'Setup'),
    ]);
  });

  it('renders a demoted h1 as a link at the top indent', async () => {
    await renderInTestApp(
      <ColophonToc
        pageTitle="Payments API"
        headings={[h(1, 'Payments API'), h(1, 'Appendix')]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Appendix' })).toHaveAttribute(
      'href',
      '#appendix',
    );
    expect(screen.queryByRole('link', { name: 'Payments API' })).toBeNull();
  });
});
