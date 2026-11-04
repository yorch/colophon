import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateMessage } from './StateMessage';

describe('StateMessage', () => {
  it('is loading only when asked, whatever the title ends with', async () => {
    await renderInTestApp(<StateMessage title="Loading…" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces a loading state as a busy status region', async () => {
    await renderInTestApp(<StateMessage variant="loading" title="Loading…" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('puts the title and detail in separate blocks', async () => {
    await renderInTestApp(
      <StateMessage title="Empty" detail="Do the thing." />,
    );
    const title = screen.getByText('Empty');
    const detail = screen.getByText('Do the thing.');
    expect(title.tagName).toBe('DIV');
    expect(detail.tagName).toBe('DIV');
  });

  it('renders not-found as a plain message, not an alert', async () => {
    await renderInTestApp(
      <StateMessage
        variant="notFound"
        title="Gone"
        actions={<a href="/x">Back</a>}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
  });

  it('renders errors as an alert with the message folded away and a retry', async () => {
    const onRetry = jest.fn();
    await renderInTestApp(
      <StateMessage
        title="Broke"
        error={new Error('boom')}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('boom').closest('details')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
