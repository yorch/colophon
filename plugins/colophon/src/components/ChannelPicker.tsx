import { useApi } from '@backstage/core-plugin-api';
import { Select } from '@backstage/ui';
import { useEffect, useState } from 'react';
import type { ChannelInfo } from '../api';
import { colophonApiRef } from '../api';

export interface ChannelPickerProps {
  bundleId: string;
  current: string;
  onChange: (channel: string) => void;
}

/**
 * Switches between release lines.
 *
 * Renders nothing for a bundle with a single channel, which is most of them —
 * a picker with one option is noise.
 */
export function ChannelPicker({
  bundleId,
  current,
  onChange,
}: ChannelPickerProps) {
  const api = useApi(colophonApiRef);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getChannels(bundleId).then(
      next => !cancelled && setChannels(next),
      // A failed channel list should not take the page down with it; the
      // reader still has the channel they are already on.
      () => !cancelled && setChannels([]),
    );
    return () => {
      cancelled = true;
    };
  }, [api, bundleId]);

  if (channels.length < 2) {
    return null;
  }

  return (
    <Select
      label="Version"
      selectedKey={current}
      onSelectionChange={key => onChange(String(key))}
      options={channels.map(channel => ({
        value: channel.channel,
        label: channel.isDefault
          ? `${channel.channel} (default)`
          : channel.channel,
      }))}
    />
  );
}
