import { useApi } from '@backstage/core-plugin-api';
import { entrySlug, scopeNavigation } from '@brnby/colophon-common';
import {
  ColophonComponentsProvider,
  ColophonMarkdown,
  ColophonNav,
  ColophonPageHeader,
  ColophonToc,
  useAnchorScroll,
  useColophonStyles,
  useContainerWidth,
} from '@brnby/plugin-colophon-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { isWithinSubpath } from '../annotation';
import type { ResolvedManifest } from '../api';
import { colophonApiRef } from '../api';
import { ChannelPicker } from './ChannelPicker';
import { useMarkdownComponents } from './markdownComponents';
import { StateMessage } from './StateMessage';

/** Matches the 56rem container query that gives the navigation its column. */
const NAV_BREAKPOINT = 56 * 16;

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

  /**
   * Which page to show comes from `?page=`, never from the fragment.
   *
   * The fragment belongs to heading anchors: a table-of-contents entry and a
   * `#heading` link inside a page both use it. An earlier version drove page
   * navigation from the fragment too, so clicking any heading link tried to
   * open a page named after that heading and produced a 404.
   */
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('page') ?? undefined;

  const hrefForSlug = useCallback(
    (target: string) => {
      const next = new URLSearchParams(searchParams);
      if (target) {
        next.set('page', target);
      } else {
        next.delete('page');
      }
      const search = next.toString();
      return search ? `?${search}` : '?';
    },
    [searchParams],
  );

  const [resolved, setResolved] = useState<ResolvedManifest>();
  const [error, setError] = useState<Error>();
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
    () => scopeNavigation(resolved?.manifest.nav ?? [], subpath),
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
  // The landing page has the EMPTY slug, which is falsy, so it cannot be
  // told apart from "no page requested" by ?? alone — the chain used to fall
  // through to pages[0], i.e. whichever page sorts first by path. Opening a
  // bundle showed an arbitrary page rather than its index.md. Resolve by
  // identity: the entry page of the current scope, falling back to position
  // only when no such page exists.
  const entry = entrySlug(subpath);
  const activeSlug =
    slug ?? (pages.some(page => page.slug === entry) ? entry : pages[0]?.slug);
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

  // The fragment comes from the router rather than window.location: inside
  // Backstage, an in-page anchor click is intercepted by react-aria and turned
  // into a client-side navigation, so the router sees it and `hashchange`
  // never fires.
  useColophonStyles();

  const { hash } = useLocation();
  useAnchorScroll({ hash, ready: markdown !== undefined });

  // Below the layout breakpoint the navigation is a closed disclosure, so the
  // reader lands on the page they asked for rather than on a list of every
  // other page. Above it, it is always open and its control is hidden.
  const { ref: containerRef, width: containerWidth } = useContainerWidth();
  const roomForNav =
    containerWidth === undefined || containerWidth >= NAV_BREAKPOINT;
  const [navOpen, setNavOpen] = useState(true);
  useEffect(() => {
    setNavOpen(roomForNav);
  }, [roomForNav]);

  const components = useMarkdownComponents({
    bundleId,
    fromPath: page?.path ?? 'index.md',
    channel: resolved?.channel,
    hrefForSlug,
  });

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

  const navigation = (
    <>
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
    </>
  );

  return (
    // The container the stylesheet's container queries measure. Column counts
    // live in CSS; only the disclosure's open state needs JavaScript, and it
    // reads the same width so the two cannot disagree.
    <div className="colophon-layout-container" ref={containerRef}>
      <div className="colophon-layout">
        <div className="colophon-layout-nav">
          <details
            className="colophon-nav-disclosure"
            open={navOpen}
            onToggle={event => setNavOpen(event.currentTarget.open)}
          >
            <summary>Pages</summary>
            {navigation}
          </details>
        </div>

        <div className="colophon-layout-main">
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
          {markdown === undefined && !pageError && <PageSkeleton />}
          {markdown !== undefined && (
            // Relative links and images resolve against the page they were
            // written on, which the renderer cannot know on its own.
            <ColophonComponentsProvider components={components}>
              <ColophonMarkdown content={markdown} />
            </ColophonComponentsProvider>
          )}
        </div>

        {page && page.headings.length > 0 && (
          <div className="colophon-layout-toc">
            <ColophonToc headings={page.headings} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Placeholder shaped like the page that is loading.
 *
 * Reserves roughly the space the content will take, so its arrival does not
 * shove everything below it down the screen — which is what the bare word
 * "Loading…" did on every page change.
 */
function PageSkeleton() {
  const widths = ['60%', '95%', '88%', '92%', '40%'];
  return (
    <div aria-hidden style={{ marginBlockStart: 'var(--bui-space-4)' }}>
      {widths.map((width, index) => (
        <div
          key={width + String(index)}
          className="colophon-skeleton"
          style={{
            width,
            height: index === 0 ? '1.75rem' : '1rem',
            marginBlockEnd: index === 0 ? '1.25rem' : '0.6rem',
          }}
        />
      ))}
    </div>
  );
}
