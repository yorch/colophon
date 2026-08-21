import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import type { ChannelInfo, ColophonApi } from '../api';
import { colophonApiRef } from '../api';
import { ChannelPicker } from './ChannelPicker';

function channel(overrides: Partial<ChannelInfo> = {}): ChannelInfo {
  return {
    bundleId: 'b',
    channel: 'latest',
    revisionId: 'r',
    updatedAt: '',
    isDefault: true,
    ...overrides,
  };
}

function apiStub(channels: ChannelInfo[]): ColophonApi {
  return {
    listBundles: jest.fn().mockResolvedValue([]),
    getChannels: jest.fn().mockResolvedValue(channels),
    getManifest: jest.fn(() => new Promise(() => {})),
    getPage: jest.fn(() => new Promise(() => {})),
    assetUrl: jest.fn().mockResolvedValue(''),
    search: jest
      .fn()
      .mockResolvedValue({ results: [], total: 0, limit: 10, offset: 0 }),
  };
}

describe('ChannelPicker', () => {
  it('renders nothing for a bundle with a single channel', async () => {
    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, apiStub([channel()])]]}>
        <ChannelPicker bundleId="b" current="latest" onChange={jest.fn()} />
      </TestApiProvider>,
    );

    // Give the channel list effect a chance to resolve before asserting.
    await waitFor(() => expect(container).toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a picker once a bundle has more than one channel', async () => {
    const channels = [channel(), channel({ channel: '1.x', isDefault: false })];
    await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, apiStub(channels)]]}>
        <ChannelPicker bundleId="b" current="latest" onChange={jest.fn()} />
      </TestApiProvider>,
    );

    expect(await screen.findByText('Version')).toBeInTheDocument();
  });

  it('renders nothing while the channel list is still loading', async () => {
    const api: ColophonApi = {
      listBundles: jest.fn().mockResolvedValue([]),
      getChannels: jest.fn(() => new Promise(() => {})),
      getManifest: jest.fn(() => new Promise(() => {})),
      getPage: jest.fn(() => new Promise(() => {})),
      assetUrl: jest.fn().mockResolvedValue(''),
      search: jest
        .fn()
        .mockResolvedValue({ results: [], total: 0, limit: 10, offset: 0 }),
    };
    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, api]]}>
        <ChannelPicker bundleId="b" current="latest" onChange={jest.fn()} />
      </TestApiProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
