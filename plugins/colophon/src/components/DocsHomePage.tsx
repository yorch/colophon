import { useApi } from '@backstage/core-plugin-api';
import { Box, Button, Flex, Link, SearchField, Text } from '@backstage/ui';
import {
  ColophonSkeleton,
  useColophonStyles,
} from '@brnby/plugin-colophon-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Route,
  Link as RouterLink,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import type { BundleSummary } from '../api';
import { colophonApiRef } from '../api';
import { useAppPathDriftWarning } from '../appPathDrift';
import { useDocsPath } from '../useDocsPath';
import { DocsBrowser } from './DocsBrowser';
import { StateMessage } from './StateMessage';

/** The published guide to `colophon publish`; the README links the same page. */
const PUBLISHING_GUIDE =
  'https://yorch.github.io/colophon/getting-started.html';

/**
 * The docs home page: browse every published bundle, or read one.
 *
 * Routed as `<page path>/*` because a bundle id is itself slash-separated
 * (`github.com/org/repo`) — there is no fixed number of path segments to
 * declare ahead of it, so the whole remainder becomes the bundle id and the
 * channel travels as a query param instead of a positional segment, which
 * would be ambiguous with the tail of the id.
 */
export function DocsHomePage() {
  // Here rather than in a child route, so it is said once when the page is
  // opened rather than again on every navigation within it.
  useAppPathDriftWarning();

  return (
    // The padding lives here and not in DocsBrowser: the entity tab renders
    // DocsBrowser inside a catalog page that already supplies its own margin,
    // and adding it there too would double it.
    <Box style={{ padding: 'var(--bui-space-5)' }}>
      <Routes>
        <Route path="/" element={<BundleList />} />
        <Route path="/*" element={<BundleRoute />} />
      </Routes>
    </Box>
  );
}

/**
 * When a bundle was last published, for the card.
 *
 * Summaries carry per-channel timestamps rather than one of their own, and the
 * default channel is what a reader gets by clicking through, so that is the
 * date that answers "is this current?". Falls back to the newest channel for a
 * bundle with no default set.
 */
function lastUpdated(bundle: BundleSummary): string | undefined {
  const channels = bundle.channels ?? [];
  const preferred =
    channels.find(channel => channel.channel === bundle.defaultChannel) ??
    channels.find(channel => channel.isDefault);
  const candidates = preferred ? [preferred] : channels;
  const newest = candidates
    .map(channel => channel.updatedAt)
    .filter(value => value && !Number.isNaN(Date.parse(value)))
    .sort()
    .pop();
  return newest;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Browses every published bundle. */
function BundleList() {
  useColophonStyles();
  const api = useApi(colophonApiRef);
  const docsPath = useDocsPath();
  const [bundles, setBundles] = useState<BundleSummary[]>();
  const [error, setError] = useState<Error>();
  const [filter, setFilter] = useState('');
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, not a value the effect reads.
  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    api.listBundles().then(
      next => !cancelled && setBundles(next),
      (next: Error) => !cancelled && setError(next),
    );
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  // Sorted here rather than trusting the backend's order, which is by
  // publication and so put a stress-test bundle ahead of the project's own
  // docs. Alphabetical is the one order a reader can predict.
  const sorted = useMemo(
    () =>
      [...(bundles ?? [])].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      ),
    [bundles],
  );

  // Filtering client-side because the list is one row per repository, which
  // stays small enough that a round trip per keystroke would be worse.
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) {
      return sorted;
    }
    return sorted.filter(bundle =>
      `${bundle.title} ${bundle.bundleId} ${bundle.description ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [sorted, filter]);

  if (error) {
    return (
      <StateMessage
        title="Could not load documentation"
        error={error}
        onRetry={() => {
          setBundles(undefined);
          setAttempt(count => count + 1);
        }}
      />
    );
  }
  if (!bundles) {
    return <ColophonSkeleton label="Loading documentation" />;
  }
  if (bundles.length === 0) {
    return (
      <StateMessage
        title="Nothing published yet"
        detail={
          <>
            Run{' '}
            <code style={{ fontFamily: 'var(--bui-font-monospace)' }}>
              colophon publish
            </code>{' '}
            in a repository to see its documentation here.
          </>
        }
        actions={<Link href={PUBLISHING_GUIDE}>Read the publishing guide</Link>}
      />
    );
  }

  return (
    <Box style={{ maxWidth: '56rem' }}>
      <Flex direction="column" gap="1">
        <Text as="h1" variant="title-large" weight="bold">
          Documentation
        </Text>
        <Text color="secondary" as="p">
          Documentation published from {bundles.length}{' '}
          {bundles.length === 1 ? 'repository' : 'repositories'}, sorted by
          name.
        </Text>
      </Flex>
      {/* The placeholder says what the field is, so a visible "Filter" label
          above it only said it twice. The accessible name stays. */}
      <Box style={{ marginTop: '1rem', maxWidth: '24rem' }}>
        <SearchField
          aria-label="Filter documentation"
          value={filter}
          onChange={setFilter}
          placeholder="Filter documentation"
        />
      </Box>
      <Flex direction="column" gap="3" style={{ marginTop: '1rem' }}>
        {visible.map(bundle => {
          const updated = lastUpdated(bundle);
          return (
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
                  making every word in it part of the link's name. A router
                  link, not an <a href>: the latter reloaded the whole app
                  on every click. */}
                <RouterLink
                  className="colophon-bundle-row-link"
                  to={`${docsPath}/${bundle.bundleId}`}
                >
                  {bundle.title}
                </RouterLink>
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
                {updated && (
                  <>
                    {' · Updated '}
                    <time dateTime={updated}>{formatDate(updated)}</time>
                  </>
                )}
              </Text>
            </div>
          );
        })}
        {/* Always mounted so a screen reader hears the text appear; a live
            region inserted together with its content is often not announced. */}
        <div role="status">
          {visible.length === 0 && (
            <Flex direction="column" gap="2" align="start">
              <Text as="div">No documentation matches “{filter}”.</Text>
              <Button
                variant="secondary"
                size="small"
                onPress={() => setFilter('')}
              >
                Clear filter
              </Button>
            </Flex>
          )}
        </div>
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
  const docsPath = useDocsPath();
  const [bundleTitle, setBundleTitle] = useState<string>();

  return (
    <Box>
      <Box>
        <DocsBrowser
          bundleId={bundleId}
          channel={channel}
          onBundleTitle={setBundleTitle}
          docsHref={docsPath || undefined}
          // Handed to the browser rather than rendered above it so the skip
          // link stays the first focusable element in the reader. The label
          // differs from the host header's own "Breadcrumbs" landmark, which
          // already offers a "Docs" link.
          leading={
            <nav
              aria-label="Documentation path"
              style={{ marginBottom: '1rem' }}
            >
              <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
                <Link href={docsPath || '/'}>Docs</Link>
                <span aria-hidden>›</span>
                <Text as="span" aria-current="page">
                  {bundleTitle ?? bundleId}
                </Text>
              </Flex>
            </nav>
          }
          onChannelChange={next =>
            // Replace, not push, to match the entity tab. Picking a version
            // is a view setting rather than a place the reader went, and a
            // push meant Back stepped through every version they had tried
            // before leaving the page.
            setSearchParams(
              prev => {
                const updated = new URLSearchParams(prev);
                updated.set('channel', next);
                return updated;
              },
              { replace: true },
            )
          }
        />
      </Box>
    </Box>
  );
}
