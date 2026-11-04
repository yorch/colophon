import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
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
  it('shows the current version as plain text for a single channel', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[colophonApiRef, apiStub([channel()])]]}>
        <ChannelPicker bundleId="b" current="latest" onChange={jest.fn()} />
      </TestApiProvider>,
    );

    // A select with one option is noise, but which version this is still
    // matters — it used to disappear entirely.
    expect(await screen.findByText('Version: latest')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
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
