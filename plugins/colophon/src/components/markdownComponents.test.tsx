import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import {
  ColophonComponentsProvider,
  ColophonMarkdown,
} from '@brnby/plugin-colophon-react';
import { screen, waitFor } from '@testing-library/react';
import type { ColophonApi } from '../api';
import { colophonApiRef } from '../api';
import { useMarkdownComponents } from './markdownComponents';

const api = {
  assetUrl: async (bundleId: string, path: string) =>
    `/api/colophon/bundles/${encodeURIComponent(bundleId)}/assets/${path}`,
} as unknown as ColophonApi;

/** Renders markdown the way DocsBrowser does, with resolution wired in. */
function Harness({
  content,
  fromPath = 'guides/deploy.md',
}: {
  content: string;
  fromPath?: string;
}) {
  const components = useMarkdownComponents({
    bundleId: 'github.com/org/repo',
    fromPath,
    hrefForSlug: slug => `?page=${encodeURIComponent(slug)}`,
  });
  return (
    <ColophonComponentsProvider components={components}>
      <ColophonMarkdown content={content} />
    </ColophonComponentsProvider>
  );
}

const render = (content: string, fromPath?: string) =>
  renderInTestApp(
    <TestApiProvider apis={[[colophonApiRef, api]]}>
      <Harness content={content} fromPath={fromPath} />
    </TestApiProvider>,
  );

describe('relative links', () => {
  it('rewrites a sibling page link into a portal href', async () => {
    // Authored against the file layout; served from the URL space. Without
    // this the href resolved against the browser path and 404'd, even though
    // the publisher had verified the link existed.
    await render('[Rollback](./rollback.md)\n');
    // The router makes the href absolute against the current route, which in
    // the portal is /colophon/<bundleId>; the query is what we control.
    await waitFor(() =>
      expect(
        screen.getByText('Rollback').closest('a')?.getAttribute('href'),
      ).toMatch(/\?page=guides%2Frollback$/),
    );
  });

  it('rewrites a parent-relative link', async () => {
    await render('[Home](../index.md)\n');
    await waitFor(() =>
      expect(
        screen.getByText('Home').closest('a')?.getAttribute('href'),
      ).toMatch(/\?page=$/),
    );
  });

  it('keeps a heading anchor on a cross-page link', async () => {
    await render('[Step](./rollback.md#step-two)\n');
    await waitFor(() =>
      expect(
        screen.getByText('Step').closest('a')?.getAttribute('href'),
      ).toMatch(/\?page=guides%2Frollback#step-two$/),
    );
  });

  it('leaves an in-page anchor as a bare fragment', async () => {
    // Routing it would resolve the anchor against the current path instead
    // of scrolling.
    await render('[Jump](#rotating-credentials)\n');
    await waitFor(() =>
      expect(screen.getByText('Jump').closest('a')).toHaveAttribute(
        'href',
        '#rotating-credentials',
      ),
    );
  });

  it('opens an external link away from the portal, guarded', async () => {
    await render('[Docs](https://example.com)\n');
    const anchor = await screen.findByText('Docs');
    expect(anchor.closest('a')).toHaveAttribute('target', '_blank');
    expect(anchor.closest('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('images', () => {
  it('resolves a relative image through the asset route', async () => {
    await render('![Diagram](./_assets/flow.png)\n');
    await waitFor(() =>
      expect(screen.getByAltText('Diagram')).toHaveAttribute(
        'src',
        '/api/colophon/bundles/github.com%2Forg%2Frepo/assets/guides/_assets/flow.png',
      ),
    );
  });

  it('resolves a docs-root image from a nested page', async () => {
    await render('![Logo](/_assets/logo.svg)\n');
    await waitFor(() =>
      expect(screen.getByAltText('Logo')).toHaveAttribute(
        'src',
        '/api/colophon/bundles/github.com%2Forg%2Frepo/assets/_assets/logo.svg',
      ),
    );
  });

  it('passes an external image straight through', async () => {
    await render('![Remote](https://example.com/x.png)\n');
    await waitFor(() =>
      expect(screen.getByAltText('Remote')).toHaveAttribute(
        'src',
        'https://example.com/x.png',
      ),
    );
  });

  it('renders without a src rather than crashing when lookup fails', async () => {
    const failing = {
      assetUrl: async () => {
        throw new Error('nope');
      },
    } as unknown as ColophonApi;
    await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, failing]]}>
        <Harness content={'![Broken](./_assets/missing.png)\n'} />
      </TestApiProvider>,
    );
    // A broken image must not take the page down with it.
    expect(await screen.findByAltText('Broken')).toBeInTheDocument();
  });
});
