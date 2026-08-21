import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import type { Manifest, Page } from '@brnby/colophon-common';
import { screen, waitFor } from '@testing-library/react';
import type { ColophonApi, ResolvedManifest } from '../api';
import { colophonApiRef } from '../api';
import { DocsBrowser } from './DocsBrowser';

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

async function renderWith(api: ColophonApi, bundleId = 'github.com/brnby/api') {
  return renderInTestApp(
    <TestApiProvider apis={[[colophonApiRef, api]]}>
      <DocsBrowser bundleId={bundleId} />
    </TestApiProvider>,
  );
}

describe('DocsBrowser', () => {
  it('shows a loading state before the manifest resolves', async () => {
    const api = apiStub({ getManifest: jest.fn(() => new Promise(() => {})) });
    await renderWith(api);
    expect(screen.getByText('Loading documentation…')).toBeInTheDocument();
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
      <TestApiProvider apis={[[colophonApiRef, api]]}>
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
      <TestApiProvider apis={[[colophonApiRef, api]]}>
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
