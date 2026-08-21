import { useApi } from '@backstage/core-plugin-api';
import { Box, Flex, Link, SearchField, Text } from '@backstage/ui';
import { useEffect, useMemo, useState } from 'react';
import type { BundleSummary } from '../api';
import { colophonApiRef } from '../api';
import { StateMessage } from './StateMessage';

/** Browses every published bundle. */
export function DocsHomePage() {
  const api = useApi(colophonApiRef);
  const [bundles, setBundles] = useState<BundleSummary[]>();
  const [error, setError] = useState<Error>();
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listBundles().then(
      next => !cancelled && setBundles(next),
      (next: Error) => !cancelled && setError(next),
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Filtering client-side because the list is one row per repository, which
  // stays small enough that a round trip per keystroke would be worse.
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle || !bundles) {
      return bundles ?? [];
    }
    return bundles.filter(bundle =>
      `${bundle.title} ${bundle.bundleId} ${bundle.description ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [bundles, filter]);

  if (error) {
    return <StateMessage title="Could not load documentation" error={error} />;
  }
  if (!bundles) {
    return <StateMessage title="Loading documentation…" />;
  }
  if (bundles.length === 0) {
    return (
      <StateMessage
        title="Nothing published yet"
        detail="Run colophon publish in a repository to see its documentation here."
      />
    );
  }

  return (
    <Box>
      <SearchField
        label="Filter"
        value={filter}
        onChange={setFilter}
        placeholder="Filter documentation"
      />
      <Flex direction="column" gap="3" style={{ marginTop: '1rem' }}>
        {visible.map(bundle => (
          <Box key={bundle.bundleId}>
            <Link href={`/colophon/${bundle.bundleId}`}>{bundle.title}</Link>
            {bundle.description && (
              <Text color="secondary">{bundle.description}</Text>
            )}
            <Text variant="body-small" color="secondary">
              {bundle.bundleId}
            </Text>
          </Box>
        ))}
        {visible.length === 0 && (
          <Text>No documentation matches “{filter}”.</Text>
        )}
      </Flex>
    </Box>
  );
}
