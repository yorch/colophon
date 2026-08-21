import { useApi } from '@backstage/core-plugin-api';
import { Box, Flex, Text } from '@backstage/ui';
import type { NavNode } from '@brnby/colophon-common';
import {
  ColophonMarkdown,
  ColophonNav,
  ColophonPageHeader,
  ColophonToc,
} from '@brnby/plugin-colophon-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isWithinSubpath } from '../annotation';
import type { ResolvedManifest } from '../api';
import { colophonApiRef } from '../api';
import { ChannelPicker } from './ChannelPicker';
import { StateMessage } from './StateMessage';

export interface DocsBrowserProps {
  bundleId: string;
  /** Restricts the view to a subtree of a shared bundle. */
  subpath?: string;
  /** Overrides the bundle's default channel. */
  channel?: string;
  onChannelChange?: (channel: string) => void;
}

/**
 * The reading experience: navigation, a page, and its table of contents.
 *
 * Shared by the entity tab and the standalone docs page so both render
 * identically and are restyled in one place.
 */
export function DocsBrowser({
  bundleId,
  subpath,
  channel,
  onChannelChange,
}: DocsBrowserProps) {
  const api = useApi(colophonApiRef);
  const [resolved, setResolved] = useState<ResolvedManifest>();
  const [error, setError] = useState<Error>();
  const [slug, setSlug] = useState<string>();
  const [markdown, setMarkdown] = useState<string>();
  const [pageError, setPageError] = useState<Error>();

  useEffect(() => {
    let cancelled = false;
    setResolved(undefined);
    setError(undefined);
    api.getManifest(bundleId, channel).then(
      next => !cancelled && setResolved(next),
      (next: Error) => !cancelled && setError(next),
    );
    return () => {
      cancelled = true;
    };
  }, [api, bundleId, channel]);

  const nav = useMemo(
    () => scopeNav(resolved?.manifest.nav ?? [], subpath),
    [resolved, subpath],
  );

  const pages = useMemo(
    () =>
      (resolved?.manifest.pages ?? []).filter(page =>
        isWithinSubpath(page.slug, subpath),
      ),
    [resolved, subpath],
  );

  // Default to the subtree's own entry page rather than the bundle root, so a
  // scoped entity tab opens on that entity's documentation.
  const activeSlug = slug ?? subpath ?? pages[0]?.slug;
  const page = pages.find(candidate => candidate.slug === activeSlug);

  useEffect(() => {
    if (activeSlug === undefined || !resolved) {
      return undefined;
    }
    let cancelled = false;
    setMarkdown(undefined);
    setPageError(undefined);
    api.getPage(bundleId, activeSlug, resolved.channel).then(
      next => !cancelled && setMarkdown(next.markdown),
      (next: Error) => !cancelled && setPageError(next),
    );
    return () => {
      cancelled = true;
    };
  }, [api, bundleId, activeSlug, resolved]);

  const hrefForSlug = useCallback((target: string) => `#${target}`, []);

  // Nav entries are ordinary anchors rather than click handlers, so a reader
  // can open a page in a new tab and deep links keep working on reload.
  useEffect(() => {
    const readHash = () => {
      const value = window.location.hash.replace(/^#/, '');
      setSlug(value ? decodeURIComponent(value) : undefined);
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  if (error) {
    return <StateMessage title="Could not load documentation" error={error} />;
  }
  if (!resolved) {
    return <StateMessage title="Loading documentation…" />;
  }
  if (pages.length === 0) {
    return (
      <StateMessage
        title="No documentation published yet"
        detail={
          subpath
            ? `Nothing has been published under "${subpath}" in ${bundleId}.`
            : `${bundleId} has no pages in this channel.`
        }
      />
    );
  }

  return (
    <Flex gap="4" align="start">
      <Box style={{ flex: '0 0 16rem' }}>
        {onChannelChange && (
          <ChannelPicker
            bundleId={bundleId}
            current={resolved.channel}
            onChange={onChannelChange}
          />
        )}
        <ColophonNav
          nodes={nav}
          activeSlug={activeSlug}
          hrefForSlug={hrefForSlug}
        />
      </Box>

      <Box style={{ flex: '1 1 auto', minWidth: 0 }}>
        {page && (
          <ColophonPageHeader
            title={page.title}
            description={page.description}
            type={page.type}
            status={page.status}
            updatedAt={resolved.updatedAt}
          />
        )}
        {pageError && (
          <StateMessage title="Could not load this page" error={pageError} />
        )}
        {markdown === undefined && !pageError && <Text>Loading…</Text>}
        {markdown !== undefined && <ColophonMarkdown content={markdown} />}
      </Box>

      {page && page.headings.length > 0 && (
        <Box style={{ flex: '0 0 14rem' }}>
          <ColophonToc headings={page.headings} />
        </Box>
      )}
    </Flex>
  );
}

/** Narrows the nav tree to the subtree an entity is scoped to. */
function scopeNav(nodes: NavNode[], subpath?: string): NavNode[] {
  if (!subpath) {
    return nodes;
  }
  const found = findNode(nodes, subpath);
  if (found) {
    return found.children ?? [found];
  }
  // No matching node means the shared bundle has no section for this entity;
  // showing the whole tree would be worse than showing nothing.
  return [];
}

function findNode(nodes: NavNode[], slug: string): NavNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) {
      return node;
    }
    const nested = node.children && findNode(node.children, slug);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}
