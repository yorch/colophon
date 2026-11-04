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
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading documentation',
    );
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

    await userEvent.type(
      screen.getByLabelText('Filter documentation'),
      'billing',
    );

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
      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
        'href',
        '/handbook',
      ),
    );
  });

  it('names the bundle in the breadcrumb once it has loaded', async () => {
    const api = apiStub({
      getManifest: jest.fn().mockResolvedValue({
        bundleId: 'github.com/brnby/api',
        channel: 'latest',
        revisionId: 'r',
        isDefault: true,
        updatedAt: '2026-08-20T10:00:00.000Z',
        manifest: {
          title: 'Payments API',
          pages: [],
          nav: [],
          assets: [],
        },
      }),
    });
    await renderAt(api, '/github.com/brnby/api');
    // Not "Breadcrumb(s)": the host's own header landmark already uses that,
    // and two landmarks of one name cannot be told apart.
    const nav = screen.getByRole('navigation', { name: 'Documentation path' });
    // Before the manifest arrives the id stands in, so the trail is never empty.
    await waitFor(() => expect(nav).toHaveTextContent('Docs›Payments API'));
  });

  it('keeps the skip link ahead of the breadcrumb in tab order', async () => {
    const api = apiStub({
      getManifest: jest.fn().mockResolvedValue({
        bundleId: 'github.com/brnby/api',
        channel: 'latest',
        revisionId: 'r',
        isDefault: true,
        updatedAt: '2026-08-20T10:00:00.000Z',
        manifest: {
          title: 'Payments API',
          pages: [
            {
              path: 'index.md',
              slug: '',
              title: 'Payments API',
              contentHash: 'a'.repeat(64),
              size: 1,
              status: 'current',
              tags: [],
              headings: [],
            },
          ],
          nav: [],
          assets: [],
        },
      }),
    });
    await renderAt(api, '/github.com/brnby/api');
    const skip = await screen.findByRole('link', { name: 'Skip to content' });
    const crumb = screen.getByRole('navigation', {
      name: 'Documentation path',
    });
    expect(
      skip.compareDocumentPosition(crumb) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('DocsHomePage presentation', () => {
  it('sorts alphabetically by title and counts repositories', async () => {
    const api = apiStub({
      listBundles: jest
        .fn()
        .mockResolvedValue([
          bundle({ bundleId: 'x/stress', title: 'Stress test' }),
          bundle({ bundleId: 'x/colophon', title: 'Colophon' }),
          bundle({ bundleId: 'x/api', title: 'api' }),
        ]),
    });
    await renderAt(api, '/');
    await screen.findByRole('heading', { name: 'Documentation' });
    expect(screen.getByText(/from 3 repositories/)).toBeInTheDocument();
    const names = screen
      .getAllByRole('link')
      .map(link => link.textContent)
      .filter(text => ['Stress test', 'Colophon', 'api'].includes(text ?? ''));
    expect(names).toEqual(['api', 'Colophon', 'Stress test']);
  });

  it('shows when a bundle was last published, from its default channel', async () => {
    const api = apiStub({
      listBundles: jest.fn().mockResolvedValue([
        bundle({
          defaultChannel: 'latest',
          channels: [
            {
              bundleId: 'github.com/brnby/api',
              channel: 'pr-1',
              revisionId: 'r',
              updatedAt: '2026-09-01T00:00:00.000Z',
              isDefault: false,
            },
            {
              bundleId: 'github.com/brnby/api',
              channel: 'latest',
              revisionId: 'r',
              updatedAt: '2026-08-20T10:00:00.000Z',
              isDefault: true,
            },
          ],
        }),
      ]),
    });
    const { container } = await renderAt(api, '/');
    await screen.findByText(/Updated/);
    expect(container.querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-08-20T10:00:00.000Z',
    );
  });

  it('navigates client-side instead of reloading the app', async () => {
    const getManifest = jest.fn().mockRejectedValue(new Error('unresolved'));
    const api = apiStub({
      getManifest,
      listBundles: jest.fn().mockResolvedValue([bundle()]),
    });
    await renderAt(api, '/');
    await userEvent.click(
      await screen.findByRole('link', { name: 'Payments API' }),
    );
    // A plain <a href> would have tried a full page load, which jsdom cannot
    // perform; reaching the bundle route in-process is the router at work.
    // The test mounts the page at `/`, so the splat also carries the
    // `colophon/` prefix of the link; only the router could have produced it.
    await waitFor(() =>
      expect(getManifest).toHaveBeenCalledWith(
        expect.stringContaining('github.com/brnby/api'),
        undefined,
      ),
    );
  });

  it('keeps the empty-state title and instructions in separate blocks', async () => {
    await renderAt(apiStub(), '/');
    const title = await screen.findByText('Nothing published yet');
    const code = screen.getByText('colophon publish');
    expect(code.tagName).toBe('CODE');
    // Inline siblings are what ran the two together before.
    expect(title.parentElement).not.toBe(code.parentElement);
    expect(
      screen.getByRole('link', { name: 'Read the publishing guide' }),
    ).toHaveAttribute('href', expect.stringContaining('getting-started'));
  });

  it('announces an empty filter result and offers to clear it', async () => {
    const api = apiStub({
      listBundles: jest.fn().mockResolvedValue([bundle()]),
    });
    await renderAt(api, '/');
    const field = await screen.findByLabelText('Filter documentation');
    await userEvent.type(field, 'zzz');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('No documentation matches “zzz”.');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByText('Payments API')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('offers a retry when the list fails to load', async () => {
    const listBundles = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([bundle()]);
    await renderAt(apiStub({ listBundles }), '/');
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Payments API')).toBeInTheDocument();
  });
});
