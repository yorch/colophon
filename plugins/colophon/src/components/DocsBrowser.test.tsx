import { ConfigReader } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import { scmIntegrationsApiRef } from '@backstage/integration-react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import type { Manifest, Page } from '@brnby/colophon-common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColophonApi, ResolvedManifest } from '../api';
import { colophonApiRef } from '../api';
import { DocsBrowser } from './DocsBrowser';

/**
 * A real registry rather than a stub, so the header renders the URL the
 * integration actually derives. The fixture manifest points at example.com,
 * which is deliberately NOT configured here — every assertion below predates
 * source links and must keep passing with no link rendered at all.
 */
const scm = ScmIntegrations.fromConfig(
  new ConfigReader({ integrations: { github: [{ host: 'github.com' }] } }),
);

function page(overrides: Partial<Page> = {}): Page {
  return {
    path: 'index.md',
    slug: '',
    title: 'Payments API',
    contentHash: 'a'.repeat(64),
    size: 10,
    status: 'current',
    tags: [],
    headings: [],
    ...overrides,
  };
}

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: 1,
    bundleId: 'github.com/brnby/api',
    revisionId: 'b'.repeat(64),
    createdAt: '2026-08-20T10:00:00.000Z',
    source: {
      type: 'git',
      url: 'https://example.com',
      ref: 'main',
      commit: 'c',
      path: 'docs',
    },
    title: 'Payments API',
    pages: [page()],
    nav: [{ title: 'Overview', slug: '' }],
    assets: [],
    ...overrides,
  };
}

function resolved(overrides: Partial<ResolvedManifest> = {}): ResolvedManifest {
  return {
    bundleId: 'github.com/brnby/api',
    channel: 'latest',
    revisionId: 'b'.repeat(64),
    isDefault: true,
    updatedAt: '2026-08-20T10:00:00.000Z',
    manifest: manifest(),
    ...overrides,
  };
}

function apiStub(overrides: Partial<ColophonApi> = {}): ColophonApi {
  return {
    listBundles: jest.fn().mockResolvedValue([]),
    getChannels: jest.fn().mockResolvedValue([]),
    getManifest: jest.fn().mockResolvedValue(resolved()),
    getPage: jest.fn().mockResolvedValue({
      markdown: '# Hi',
      revisionId: 'r',
      channel: 'latest',
    }),
    assetUrl: jest.fn().mockResolvedValue(''),
    search: jest
      .fn()
      .mockResolvedValue({ results: [], total: 0, limit: 10, offset: 0 }),
    ...overrides,
  };
}

async function renderWith(
  api: ColophonApi,
  bundleId = 'github.com/brnby/api',
  extra: { routeEntries?: string[]; channel?: string } = {},
) {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [colophonApiRef, api],
        [scmIntegrationsApiRef, scm],
      ]}
    >
      <DocsBrowser bundleId={bundleId} channel={extra.channel} />
    </TestApiProvider>,
    { routeEntries: extra.routeEntries },
  );
}

describe('DocsBrowser', () => {
  it('shows a loading state before the manifest resolves', async () => {
    const api = apiStub({ getManifest: jest.fn(() => new Promise(() => {})) });
    await renderWith(api);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading documentation',
    );
  });

  it('shows an error state when the manifest fetch fails', async () => {
    const api = apiStub({
      getManifest: jest.fn().mockRejectedValue(new Error('bundle unknown')),
    });
    await renderWith(api);
    await waitFor(() =>
      expect(
        screen.getByText('Could not load documentation'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('bundle unknown')).toBeInTheDocument();
  });

  it('says plainly when a bundle has nothing published', async () => {
    const api = apiStub({
      getManifest: jest
        .fn()
        .mockResolvedValue(resolved({ manifest: manifest({ pages: [] }) })),
    });
    await renderWith(api);
    await waitFor(() =>
      expect(
        screen.getByText('No documentation published yet'),
      ).toBeInTheDocument(),
    );
  });

  it('says plainly when nothing is published under a subpath', async () => {
    const api = apiStub();
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [colophonApiRef, api],
          [scmIntegrationsApiRef, scm],
        ]}
      >
        <DocsBrowser
          bundleId="github.com/brnby/platform"
          subpath="services/billing"
        />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText('No documentation published yet'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/services\/billing/)).toBeInTheDocument();
  });

  it('renders the page header, markdown and nav once loaded', async () => {
    const api = apiStub();
    await renderWith(api);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Payments API' }),
      ).toBeInTheDocument(),
    );
    expect(await screen.findByText('Hi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
  });

  it('shows a page-level error without losing the nav', async () => {
    const api = apiStub({
      getPage: jest.fn().mockRejectedValue(new Error('page missing')),
    });
    await renderWith(api);
    await waitFor(() =>
      expect(screen.getByText('Could not load this page')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
  });

  it('resolves the channel the manifest was actually served on', async () => {
    const getPage = jest
      .fn()
      .mockResolvedValue({ markdown: 'body', revisionId: 'r', channel: '1.x' });
    const api = apiStub({
      getManifest: jest.fn().mockResolvedValue(resolved({ channel: '1.x' })),
      getPage,
    });
    await renderWith(api);
    await waitFor(() => expect(getPage).toHaveBeenCalled());
    // The page fetch must follow the channel the manifest resolved to, not
    // whatever (possibly undefined) channel the caller originally asked for.
    expect(getPage).toHaveBeenCalledWith('github.com/brnby/api', '', '1.x');
  });

  it('renders a channel picker only when a change handler is given', async () => {
    const api = apiStub({
      getChannels: jest.fn().mockResolvedValue([
        {
          bundleId: 'b',
          channel: 'latest',
          revisionId: 'r',
          updatedAt: '',
          isDefault: true,
        },
        {
          bundleId: 'b',
          channel: '1.x',
          revisionId: 'r2',
          updatedAt: '',
          isDefault: false,
        },
      ]),
    });
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [colophonApiRef, api],
          [scmIntegrationsApiRef, scm],
        ]}
      >
        <DocsBrowser
          bundleId="github.com/brnby/api"
          onChannelChange={jest.fn()}
        />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Payments API' }),
      ).toBeInTheDocument(),
    );
    expect(await screen.findByText('Version')).toBeInTheDocument();
  });
});

/**
 * jsdom has no layout and no navigation, so these assert the ANCHOR — that
 * the right href reaches the DOM, and that the absent case renders nothing at
 * all rather than an empty or broken one. Whether the link LANDS on the file
 * is a browser question, checked by hand against a running app.
 */
describe('DocsBrowser source links', () => {
  it('offers view and edit links for a bundle with a resolvable source', async () => {
    const api = apiStub({
      getManifest: jest.fn().mockResolvedValue(
        resolved({
          manifest: manifest({
            source: {
              type: 'git',
              url: 'https://github.com/brnby/api',
              ref: 'main',
              commit: 'c',
              path: 'docs',
            },
            pages: [page({ path: 'guides/deploy.md', slug: 'guides/deploy' })],
            nav: [{ title: 'Deploy', slug: 'guides/deploy' }],
          }),
        }),
      ),
    });
    await renderWith(api);

    expect(
      await screen.findByRole('link', { name: 'Edit this page' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/brnby/api/edit/main/docs/guides/deploy.md',
    );
    expect(screen.getByRole('link', { name: 'View source' })).toHaveAttribute(
      'href',
      'https://github.com/brnby/api/tree/main/docs/guides/deploy.md',
    );
  });

  // Every bundle published before this shipped looks like the default
  // fixture: a host with no integration, and nothing to link to.
  it('renders no link at all when the host has no integration', async () => {
    const api = apiStub();
    await renderWith(api);

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Payments API' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'Edit this page' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'View source' })).toBeNull();
  });
});

/** What `ResponseError` looks like to the code that classifies it. */
function httpError(status: number): Error {
  return Object.assign(new Error(`Request failed with ${status}`), {
    response: { status },
  });
}

describe('DocsBrowser failure states', () => {
  it('explains an unknown version and offers the default one', async () => {
    const api = apiStub({
      getManifest: jest.fn().mockRejectedValue(httpError(404)),
    });
    await renderWith(api, 'github.com/brnby/api', {
      channel: 'pr-42',
      routeEntries: ['/docs?channel=pr-42&page=x'],
    });
    expect(
      await screen.findByText("That version doesn't exist"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Request failed/)).toBeNull();
    // Both the channel and the page are dropped: the page may not exist in
    // the default version either, and landing on a second 404 is no way out.
    expect(
      screen.getByRole('link', { name: 'View the default version' }),
    ).toHaveAttribute('href', '/docs');
  });

  it('explains an unknown bundle without blaming the reader', async () => {
    const api = apiStub({
      getManifest: jest.fn().mockRejectedValue(httpError(404)),
    });
    await renderWith(api);
    expect(
      await screen.findByText('Documentation not found'),
    ).toBeInTheDocument();
    // Not an alert: a stale link is not a malfunction.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links to all documentation from an unknown bundle when told where', async () => {
    const api = apiStub({
      getManifest: jest.fn().mockRejectedValue(httpError(404)),
    });
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [colophonApiRef, api],
          [scmIntegrationsApiRef, scm],
        ]}
      >
        <DocsBrowser bundleId="x/y" docsHref="/handbook" />
      </TestApiProvider>,
    );
    expect(
      await screen.findByRole('link', { name: 'Browse all documentation' }),
    ).toHaveAttribute('href', '/handbook');
  });

  it('answers an unknown page from the manifest without fetching it', async () => {
    const getPage = jest.fn();
    const api = apiStub({ getPage });
    await renderWith(api, 'github.com/brnby/api', {
      routeEntries: ['/docs?page=nope'],
    });
    expect(
      await screen.findByText("This page doesn't exist"),
    ).toBeInTheDocument();
    expect(getPage).not.toHaveBeenCalled();
    // The navigation survives, so there is somewhere to go.
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the start page' }),
    ).toHaveAttribute('href', '/docs');
  });

  it('treats a page the server calls missing as not found, not as a failure', async () => {
    const api = apiStub({
      getPage: jest.fn().mockRejectedValue(httpError(404)),
    });
    await renderWith(api);
    expect(
      await screen.findByText("This page doesn't exist"),
    ).toBeInTheDocument();
    expect(screen.queryByText('Could not load this page')).toBeNull();
  });

  it('keeps the raw message out of the headline and offers a retry', async () => {
    const getManifest = jest
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValue(resolved());
    await renderWith(apiStub({ getManifest }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Could not load documentation'),
    ).toBeVisible();
    // Present for whoever reports it, but folded away.
    expect(within(alert).getByText('Technical details')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: 'Payments API' }),
    ).toBeInTheDocument();
    expect(getManifest).toHaveBeenCalledTimes(2);
  });

  it('retries a failed page without refetching the manifest', async () => {
    const getManifest = jest.fn().mockResolvedValue(resolved());
    const getPage = jest
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValue({
        markdown: 'Recovered',
        revisionId: 'r',
        channel: 'latest',
      });
    await renderWith(apiStub({ getManifest, getPage }));
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });
});

describe('DocsBrowser chrome', () => {
  it('sets the tab title from the page and bundle, and restores it', async () => {
    document.title = 'Backstage';
    const api = apiStub({
      getManifest: jest.fn().mockResolvedValue(
        resolved({
          manifest: manifest({
            title: 'Payments',
            pages: [page({ title: 'Deploying' })],
          }),
        }),
      ),
    });
    const { unmount } = await renderWith(api);
    await waitFor(() => expect(document.title).toBe('Deploying · Payments'));
    unmount();
    expect(document.title).toBe('Backstage');
  });

  it('reports the bundle title to a host page', async () => {
    const onBundleTitle = jest.fn();
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [colophonApiRef, apiStub()],
          [scmIntegrationsApiRef, scm],
        ]}
      >
        <DocsBrowser bundleId="x/y" onBundleTitle={onBundleTitle} />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(onBundleTitle).toHaveBeenCalledWith('Payments API'),
    );
  });

  it('offers a skip link that moves focus to the content', async () => {
    await renderWith(apiStub());
    const skip = await screen.findByRole('link', { name: 'Skip to content' });
    await userEvent.click(skip);
    expect(skip.getAttribute('href')?.startsWith('#')).toBe(true);
    // The target is the main column, focusable programmatically only.
    const target = document.getElementById(
      skip.getAttribute('href')?.slice(1) ?? '',
    );
    expect(target).toHaveFocus();
  });

  // The Pages disclosure closing on a page change depends on the container's
  // measured width, and jsdom has no layout — `useContainerWidth` reports
  // nothing there — so that behaviour is for a browser to confirm.
  it('keeps the version picker outside the collapsible Pages menu', async () => {
    const api = apiStub({
      getChannels: jest.fn().mockResolvedValue([
        {
          bundleId: 'b',
          channel: 'latest',
          revisionId: 'r',
          updatedAt: '',
          isDefault: true,
        },
        {
          bundleId: 'b',
          channel: '1.x',
          revisionId: 'r2',
          updatedAt: '',
          isDefault: false,
        },
      ]),
    });
    const { container } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [colophonApiRef, api],
          [scmIntegrationsApiRef, scm],
        ]}
      >
        <DocsBrowser bundleId="x/y" onChannelChange={jest.fn()} />
      </TestApiProvider>,
    );
    const label = await screen.findByText('Version');
    expect(label.closest('details')).toBeNull();
    expect(container.querySelector('details')).not.toBeNull();
  });
});

describe('DocsBrowser table of contents', () => {
  it('renders the disclosure and sidebar TOC only for pages with headings', async () => {
    const withHeadings = apiStub({
      getManifest: jest.fn().mockResolvedValue(
        resolved({
          manifest: manifest({
            pages: [
              page({
                headings: [{ depth: 2, text: 'Setup', anchor: 'setup' }],
              }),
            ],
          }),
        }),
      ),
    });
    const { container, unmount } = await renderWith(withHeadings);
    await screen.findByRole('heading', { name: 'Payments API' });
    expect(screen.getAllByText('On this page').length).toBeGreaterThan(0);
    expect(container.querySelector('.colophon-layout-toc')).not.toBeNull();
    unmount();

    const { container: bare } = await renderWith(apiStub());
    await screen.findByRole('heading', { name: 'Payments API' });
    expect(screen.queryByText('On this page')).toBeNull();
    expect(bare.querySelector('.colophon-layout-toc')).toBeNull();
  });
});
