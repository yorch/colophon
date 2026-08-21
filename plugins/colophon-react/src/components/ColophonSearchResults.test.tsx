import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import type { ColophonSearchResult } from './ColophonSearchResults';
import { ColophonSearchResults } from './ColophonSearchResults';

const results: ColophonSearchResult[] = [
  {
    bundleId: 'github.com/brnby/payments-api',
    slug: 'guides/ops',
    anchor: 'rotating-credentials',
    title: 'Rotating credentials',
    breadcrumb: ['Payments API', 'Operations', 'Rotating credentials'],
    text: 'Rotate the signing key every ninety days.',
  },
];

const hrefForResult = (result: ColophonSearchResult) =>
  `/colophon/${result.bundleId}/${result.slug}#${result.anchor}`;

describe('ColophonSearchResults', () => {
  it('renders a hit with its breadcrumb and snippet', async () => {
    await renderInTestApp(
      <ColophonSearchResults results={results} hrefForResult={hrefForResult} />,
    );

    expect(
      screen.getByRole('link', { name: 'Rotating credentials' }),
    ).toHaveAttribute(
      'href',
      '/colophon/github.com/brnby/payments-api/guides/ops#rotating-credentials',
    );
    expect(
      screen.getByText('Payments API › Operations › Rotating credentials'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rotate the signing key every ninety days.'),
    ).toBeInTheDocument();
  });

  it('shows an empty state rather than an empty list', async () => {
    await renderInTestApp(
      <ColophonSearchResults results={[]} hrefForResult={hrefForResult} />,
    );

    expect(
      screen.getByText('No documentation matched that query.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('accepts a caller-supplied empty message', async () => {
    await renderInTestApp(
      <ColophonSearchResults
        results={[]}
        hrefForResult={hrefForResult}
        emptyMessage="Nothing here yet."
      />,
    );

    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });
});
