import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BundleSummary, ColophonApi } from '../api';
import { colophonApiRef } from '../api';
import { colophonRouteRef } from '../plugin';
import { DocsHomePage } from './DocsHomePage';

function bundle(overrides: Partial<BundleSummary> = {}): BundleSummary {
  return {
    bundleId: 'github.com/brnby/api',
    title: 'Payments API',
    channels: [],
    ...overrides,
  };
}

function apiStub(overrides: Partial<ColophonApi> = {}): ColophonApi {
  return {
    listBundles: jest.fn().mockResolvedValue([]),
    getChannels: jest.fn().mockResolvedValue([]),
    getManifest: jest.fn().mockRejectedValue(new Error('not used')),
    getPage: jest.fn().mockRejectedValue(new Error('not used')),
    assetUrl: jest.fn().mockResolvedValue(''),
    search: jest
      .fn()
      .mockResolvedValue({ results: [], total: 0, limit: 10, offset: 0 }),
    ...overrides,
  };
}

/**
 * @param mountPath - where the page extension is mounted, which an app
 *   configures. Passing something other than the default is the whole point
 *   of the tests below that do.
 */
async function renderAt(
  api: ColophonApi,
  path: string,
  mountPath = '/colophon',
) {
  return renderInTestApp(
    <TestApiProvider apis={[[colophonApiRef, api]]}>
      <DocsHomePage />
    </TestApiProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { [mountPath]: colophonRouteRef },
    },
  );
}

describe('DocsHomePage browse list', () => {
  it('shows a loading state before bundles resolve', async () => {
    const api = apiStub({ listBundles: jest.fn(() => new Promise(() => {})) });
    await renderAt(api, '/');
    expect(screen.getByText('Loading documentation…')).toBeInTheDocument();
  });

  it('shows an error state when the list fails to load', async () => {
    const api = apiStub({
      listBundles: jest.fn().mockRejectedValue(new Error('down')),
    });
    await renderAt(api, '/');
    await waitFor(() =>
      expect(
        screen.getByText('Could not load documentation'),
      ).toBeInTheDocument(),
    );
  });

  it('says plainly when nothing has been published anywhere', async () => {
    const api = apiStub();
    await renderAt(api, '/');
    await waitFor(() =>
      expect(screen.getByText('Nothing published yet')).toBeInTheDocument(),
    );
  });

  it('lists bundles and filters them client-side', async () => {
    const api = apiStub({
      listBundles: jest
        .fn()
        .mockResolvedValue([
          bundle(),
          bundle({ bundleId: 'github.com/brnby/billing', title: 'Billing' }),
        ]),
    });
    await renderAt(api, '/');
    await waitFor(() =>
      expect(screen.getByText('Payments API')).toBeInTheDocument(),
    );
    expect(screen.getByText('Billing')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Filter'), 'billing');

    expect(screen.queryByText('Payments API')).not.toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('links each bundle to its own route', async () => {
    const api = apiStub({
      listBundles: jest.fn().mockResolvedValue([bundle()]),
    });
    await renderAt(api, '/');
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Payments API' }),
      ).toHaveAttribute('href', '/colophon/github.com/brnby/api'),
    );
  });

  // `/colophon` is a default, not a fact: PageBlueprint takes `path` from
  // config, and these links used to spell it out, so an app that moved the
  // page got a list where every row 404'd. Asserting the href only proves the
  // attribute — that clicking it lands anywhere has to be seen in a browser,
  // since jsdom has no router of its own.
  it('builds bundle links from the configured page path', async () => {
    const api = apiStub({
      listBundles: jest.fn().mockResolvedValue([bundle()]),
    });
    await renderAt(api, '/', '/handbook');
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Payments API' }),
      ).toHaveAttribute('href', '/handbook/github.com/brnby/api'),
    );
  });
});

describe('DocsHomePage bundle route', () => {
  it('resolves the bundle id from the rest of the path', async () => {
    const getManifest = jest.fn().mockRejectedValue(new Error('unresolved'));
    const api = apiStub({ getManifest });
    await renderAt(api, '/github.com/brnby/api');
    await waitFor(() =>
      expect(getManifest).toHaveBeenCalledWith(
        'github.com/brnby/api',
        undefined,
      ),
    );
  });

  it('reads the channel from the query string, not the path', async () => {
    const getManifest = jest.fn().mockRejectedValue(new Error('unresolved'));
    const api = apiStub({ getManifest });
    await renderAt(api, '/github.com/brnby/api?channel=1.x');
    await waitFor(() =>
      expect(getManifest).toHaveBeenCalledWith('github.com/brnby/api', '1.x'),
    );
  });

  it('points the way back at the configured page path', async () => {
    const api = apiStub();
    await renderAt(api, '/github.com/brnby/api', '/handbook');
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: '← All documentation' }),
      ).toHaveAttribute('href', '/handbook'),
    );
  });
});
