import { useEntity } from '@backstage/plugin-catalog-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readBundleRef } from '../annotation';
import { DocsBrowser } from './DocsBrowser';
import { StateMessage } from './StateMessage';

/** The documentation tab on a catalog entity. */
export function EntityColophonContent() {
  const { entity } = useEntity();

  // The channel comes from the URL, not from component state. The backend
  // puts it there when it builds a citable link, including for the entity
  // route — so keeping it in useState meant every agent citation and search
  // result pointing at a non-default channel silently opened the default
  // one, presenting a page from the wrong version as the cited source.
  const [searchParams, setSearchParams] = useSearchParams();
  const channel = searchParams.get('channel') ?? undefined;

  const setChannel = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams);
      params.set('channel', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

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
