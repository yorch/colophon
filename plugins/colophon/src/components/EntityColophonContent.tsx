import { useEntity } from '@backstage/plugin-catalog-react';
import { useState } from 'react';
import { readBundleRef } from '../annotation';
import { DocsBrowser } from './DocsBrowser';
import { StateMessage } from './StateMessage';

/** The documentation tab on a catalog entity. */
export function EntityColophonContent() {
  const { entity } = useEntity();
  const [channel, setChannel] = useState<string>();
  const ref = readBundleRef(entity);

  if (!ref) {
    return (
      <StateMessage
        title="No documentation configured"
        detail="Add the brnby.io/colophon annotation to this entity to link it to a documentation bundle."
      />
    );
  }

  return (
    <DocsBrowser
      bundleId={ref.bundleId}
      subpath={ref.subpath}
      channel={channel}
      onChannelChange={setChannel}
    />
  );
}
