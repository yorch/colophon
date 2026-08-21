import type { Entity } from '@backstage/catalog-model';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import type { ColophonApi } from '../api';
import { colophonApiRef } from '../api';
import { EntityColophonContent } from './EntityColophonContent';

function entity(annotation?: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'payments-api',
      ...(annotation
        ? { annotations: { 'brnby.io/colophon': annotation } }
        : {}),
    },
  };
}

function apiStub(overrides: Partial<ColophonApi> = {}): ColophonApi {
  return {
    listBundles: jest.fn().mockResolvedValue([]),
    getChannels: jest.fn().mockResolvedValue([]),
    getManifest: jest.fn(() => new Promise(() => {})),
    getPage: jest.fn(() => new Promise(() => {})),
    assetUrl: jest.fn().mockResolvedValue(''),
    search: jest
      .fn()
      .mockResolvedValue({ results: [], total: 0, limit: 10, offset: 0 }),
    ...overrides,
  };
}

describe('EntityColophonContent', () => {
  it('asks the reader to add the annotation when none is set', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, apiStub()]]}>
        <EntityProvider entity={entity()}>
          <EntityColophonContent />
        </EntityProvider>
      </TestApiProvider>,
    );

    expect(screen.getByText('No documentation configured')).toBeInTheDocument();
  });

  it('reads the bundle id off the annotation and starts loading it', async () => {
    const getManifest: ColophonApi['getManifest'] = jest.fn(
      () => new Promise(() => {}),
    );
    await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, apiStub({ getManifest })]]}>
        <EntityProvider entity={entity('github.com/brnby/api')}>
          <EntityColophonContent />
        </EntityProvider>
      </TestApiProvider>,
    );

    await waitFor(() =>
      expect(getManifest).toHaveBeenCalledWith(
        'github.com/brnby/api',
        undefined,
      ),
    );
  });

  it('treats a malformed annotation the same as a missing one', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, apiStub()]]}>
        <EntityProvider entity={entity('GitHub.com/UPPER')}>
          <EntityColophonContent />
        </EntityProvider>
      </TestApiProvider>,
    );

    expect(screen.getByText('No documentation configured')).toBeInTheDocument();
  });
});
