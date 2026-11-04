import { useApi } from '@backstage/core-plugin-api';
import { Select, Text } from '@backstage/ui';
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
 * A bundle with a single channel, which is most of them, gets a read-only
 * label instead of a picker — a select with one option is noise, but the
 * reader should still be able to see which version they are looking at.
 */
export function ChannelPicker({
  bundleId,
  current,
  onChange,
}: ChannelPickerProps) {
  const api = useApi(colophonApiRef);
  const [channels, setChannels] = useState<ChannelInfo[]>();

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

  // Nothing until the list arrives, so the label does not flash in as one
  // option and then turn into a picker.
  if (!channels) {
    return null;
  }

  if (channels.length < 2) {
    return (
      <Text
        variant="body-small"
        color="secondary"
        as="div"
        className="colophon-channel-picker"
      >
        Version: {current}
      </Text>
    );
  }

  return (
    // A stable hook for the stylesheet: the native select inside has no
    // visible focus indicator of its own, and BUI's class names are not ours
    // to select on.
    <div className="colophon-channel-picker">
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
    </div>
  );
}
