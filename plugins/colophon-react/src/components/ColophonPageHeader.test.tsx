import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { ColophonPageHeader } from './ColophonPageHeader';

describe('ColophonPageHeader', () => {
  it('renders the title, description, type and edit link', async () => {
    await renderInTestApp(
      <ColophonPageHeader
        title="Rotating credentials"
        description="How to rotate the payments API signing key."
        type="how-to"
        updatedAt="2026-03-04T09:15:00Z"
        editUrl="https://github.com/brnby/payments-api/edit/main/docs/ops.md"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Rotating credentials' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('How to rotate the payments API signing key.'),
    ).toBeInTheDocument();
    expect(screen.getByText('how-to')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Edit this page' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/brnby/payments-api/edit/main/docs/ops.md',
    );
  });

  it('badges a non-default status but stays quiet about "current"', async () => {
    const { rerender } = await renderInTestApp(
      <ColophonPageHeader title="Legacy webhooks" status="deprecated" />,
    );
    expect(screen.getByText('Deprecated')).toBeInTheDocument();

    rerender(<ColophonPageHeader title="Legacy webhooks" status="current" />);
    expect(screen.queryByText('Current')).toBeNull();
  });

  it('renders a machine-readable timestamp', async () => {
    const { container } = await renderInTestApp(
      <ColophonPageHeader title="Overview" updatedAt="2026-03-04T09:15:00Z" />,
    );

    expect(container.querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-03-04T09:15:00Z',
    );
  });

  it('falls back to the raw value for an unparseable timestamp', async () => {
    await renderInTestApp(
      <ColophonPageHeader title="Overview" updatedAt="not-a-date" />,
    );

    expect(screen.getByText('not-a-date')).toBeInTheDocument();
  });

  it('omits optional chrome when nothing was supplied', async () => {
    await renderInTestApp(<ColophonPageHeader title="Overview" />);

    expect(screen.queryByRole('link', { name: 'Edit this page' })).toBeNull();
  });
});
