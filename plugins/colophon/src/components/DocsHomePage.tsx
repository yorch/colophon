import { useApi } from '@backstage/core-plugin-api';
import { Box, Flex, Link, SearchField, Text } from '@backstage/ui';
import { useColophonStyles } from '@brnby/plugin-colophon-react';
import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import type { BundleSummary } from '../api';
import { colophonApiRef } from '../api';
import { DocsBrowser } from './DocsBrowser';
import { StateMessage } from './StateMessage';

/**
 * The docs home page: browse every published bundle, or read one.
 *
 * Routed as `/colophon/*` because a bundle id is itself slash-separated
 * (`github.com/org/repo`) — there is no fixed number of path segments to
 * declare ahead of it, so the whole remainder becomes the bundle id and the
 * channel travels as a query param instead of a positional segment, which
 * would be ambiguous with the tail of the id.
 */
export function DocsHomePage() {
  return (
    <Routes>
      <Route path="/" element={<BundleList />} />
      <Route path="/*" element={<BundleRoute />} />
    </Routes>
  );
}

/** Browses every published bundle. */
function BundleList() {
  useColophonStyles();
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
    <Box style={{ maxWidth: '56rem' }}>
      <SearchField
        label="Filter"
        value={filter}
        onChange={setFilter}
        placeholder="Filter documentation"
      />
      <Flex direction="column" gap="3" style={{ marginTop: '1rem' }}>
        {visible.map(bundle => (
          // The whole row is the link, not just the title: a row is one
          // destination, and a title-sized target in a full-width row is a
          // needlessly small thing to hit.
          <div key={bundle.bundleId} className="colophon-bundle-row">
            {/* `as="div"` throughout: BUI's Text is inline by default, and
                three inline children in a row rendered the title, the
                description and the id as one unbroken line of prose. */}
            <Text variant="body-medium" weight="bold" as="div">
              {/* Only the title is the link. Its hit area is stretched over
                  the whole row in CSS, which keeps the row clickable without
                  making every word in it part of the link's name. */}
              <a
                className="colophon-bundle-row-link"
                href={`/colophon/${bundle.bundleId}`}
              >
                {bundle.title}
              </a>
            </Text>
            {bundle.description && (
              <Text
                color="secondary"
                as="div"
                style={{ marginBlock: '0.35rem' }}
              >
                {bundle.description}
              </Text>
            )}
            <Text variant="body-small" color="secondary" as="div">
              {bundle.bundleId}
            </Text>
          </div>
        ))}
        {visible.length === 0 && (
          <Text>No documentation matches “{filter}”.</Text>
        )}
      </Flex>
    </Box>
  );
}

/** Reads one bundle, resolved from the rest of the URL path. */
function BundleRoute() {
  const params = useParams();
  // The `*` param is already segment-decoded by react-router; a bundle id's
  // charset needs no further decoding.
  const bundleId = params['*'] ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const channel = searchParams.get('channel') ?? undefined;

  return (
    <Box>
      <Link href="/colophon">← All documentation</Link>
      <Box style={{ marginTop: '1rem' }}>
        <DocsBrowser
          bundleId={bundleId}
          channel={channel}
          onChannelChange={next =>
            setSearchParams(prev => {
              const updated = new URLSearchParams(prev);
              updated.set('channel', next);
              return updated;
            })
          }
        />
      </Box>
    </Box>
  );
}
