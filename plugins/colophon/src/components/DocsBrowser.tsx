import { useApi } from '@backstage/core-plugin-api';
import { scmIntegrationsApiRef } from '@backstage/integration-react';
import { ButtonLink, Link } from '@backstage/ui';
import { entrySlug, scopeNavigation } from '@brnby/colophon-common';
import {
  ColophonNav,
  ColophonPageHeader,
  ColophonSkeleton,
  ColophonToc,
  NAV_BREAKPOINT_REM,
  tocEntries,
  useAnchorScroll,
  useColophonStyles,
  useContainerWidth,
} from '@brnby/plugin-colophon-react';
import type { ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { isWithinSubpath } from '../annotation';
import type { ResolvedManifest } from '../api';
import { colophonApiRef } from '../api';
import { httpStatus } from '../errors';
import { pageSourceLinks } from '../sourceLinks';
import { ChannelPicker } from './ChannelPicker';
import { PageMarkdown } from './markdownComponents';
import { StateMessage } from './StateMessage';

/**
 * The container width, in px, at which the navigation gets its own column.
 *
 * Derived from the same rem number the stylesheet's `@container` condition is
 * built from, and converted with the root font size because a container query
 * in rem resolves against that, not against 16. A second hand-written number
 * here (56rem, against CSS's 48rem) left a band where script had closed the
 * Pages disclosure while CSS had already hidden its summary.
 */
export function navBreakpointPx(): number {
  const root =
    typeof document === 'undefined'
      ? Number.NaN
      : Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return NAV_BREAKPOINT_REM * (root > 0 ? root : 16);
}

export interface DocsBrowserProps {
  bundleId: string;
  /** Restricts the view to a subtree of a shared bundle. */
  subpath?: string;
  /** Overrides the bundle's default channel. */
  channel?: string;
  onChannelChange?: (channel: string) => void;
  /**
   * Told the bundle's title once the manifest resolves, so a host page can
   * label its own chrome (a breadcrumb) with it without fetching the manifest
   * a second time.
   */
  onBundleTitle?: (title: string) => void;
  /**
   * Where "all documentation" lives, offered when the bundle does not exist.
   *
   * A prop rather than read from the route ref here: the entity tab has no
   * docs home to point at, and a component that is also embedded by adopters
   * should not require a route binding it cannot rely on.
   */
  docsHref?: string;
  /**
   * Rendered inside the reader, directly after its skip link. For a host's own
   * breadcrumb: placed before the browser it would come first in tab order and
   * the skip link could not skip it.
   */
  leading?: ReactNode;
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
  onBundleTitle,
  docsHref,
  leading,
}: DocsBrowserProps) {
  const api = useApi(colophonApiRef);
  const { pathname } = useLocation();
  const [attempt, setAttempt] = useState(0);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, not a value the effect reads.
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
  }, [api, bundleId, channel, attempt]);

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

  // Undefined for every bundle published without `--source-*`, and for any
  // host this app has no SCM integration for, in which case the header simply
  // renders no link. That is the common case on first upgrade, so it has to
  // be the quiet one.
  const scm = useApi(scmIntegrationsApiRef);
  const sourceLinks = useMemo(
    () =>
      pageSourceLinks({
        scm,
        source: resolved?.manifest.source,
        pagePath: page?.path,
      }),
    [scm, resolved, page],
  );

  // An unknown slug is answered from the manifest instead of by asking the
  // server for a page it has just told us does not exist.
  const pageKnown = page !== undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, not a value the effect reads.
  useEffect(() => {
    if (activeSlug === undefined || !resolved || !pageKnown) {
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
  }, [api, bundleId, activeSlug, resolved, pageKnown, attempt]);

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
    containerWidth === undefined || containerWidth >= navBreakpointPx();
  const [navOpen, setNavOpen] = useState(true);

  // The tab title is the only place a reader sees which document a background
  // tab is, and without this every page was "Backstage". Restored on unmount
  // so leaving the docs does not strand the last page's title on the next one.
  const bundleTitle = resolved?.manifest.title;
  const pageTitle = page?.title;
  useEffect(() => {
    if (!bundleTitle) {
      return undefined;
    }
    const previous = document.title;
    document.title =
      pageTitle && pageTitle !== bundleTitle
        ? `${pageTitle} · ${bundleTitle}`
        : bundleTitle;
    return () => {
      document.title = previous;
    };
  }, [bundleTitle, pageTitle]);

  useEffect(() => {
    if (bundleTitle) {
      onBundleTitle?.(bundleTitle);
    }
  }, [bundleTitle, onBundleTitle]);

  // Pages is a disclosure below the layout breakpoint, and it used to stay
  // open after a choice, leaving the reader to scroll past the whole list to
  // reach the page they had just picked. Tying the reset to the slug rather
  // than to a click handler also covers back/forward and in-page links.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `activeSlug` is the trigger; only the width decides the value.
  useEffect(() => {
    setNavOpen(roomForNav);
  }, [roomForNav, activeSlug]);

  const mainRef = useRef<HTMLDivElement>(null);
  const mainId = useId();

  const markdownContext = useMemo(
    () => ({
      bundleId,
      fromPath: page?.path ?? 'index.md',
      channel: resolved?.channel,
      hrefForSlug,
    }),
    [bundleId, page?.path, resolved?.channel, hrefForSlug],
  );

  const withoutVersion = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('channel');
    next.delete('page');
    const search = next.toString();
    return `${pathname}${search ? `?${search}` : ''}`;
  };

  // The host's breadcrumb must survive loading and failure, not only success.
  const withLeading = (state: ReactNode) => (
    <>
      {leading}
      {state}
    </>
  );

  if (error) {
    if (httpStatus(error) === 404) {
      // Two different dead ends that the server reports identically. The
      // channel is the likelier culprit when one was asked for: a link to
      // `?channel=pr-42` outlives the pull request it pointed at.
      if (channel) {
        return withLeading(
          <StateMessage
            variant="notFound"
            title="That version doesn't exist"
            detail={`${bundleId} has no version called "${channel}". It may have been removed.`}
            actions={
              <ButtonLink
                variant="secondary"
                size="small"
                href={withoutVersion()}
              >
                View the default version
              </ButtonLink>
            }
          />,
        );
      }
      return withLeading(
        <StateMessage
          variant="notFound"
          title="Documentation not found"
          detail={`Nothing has been published for ${bundleId}.`}
          actions={
            docsHref ? (
              <Link href={docsHref}>Browse all documentation</Link>
            ) : undefined
          }
        />,
      );
    }
    return withLeading(
      <StateMessage
        title="Could not load documentation"
        error={error}
        onRetry={() => setAttempt(count => count + 1)}
      />,
    );
  }
  if (!resolved) {
    return withLeading(
      <ColophonSkeleton variant="layout" label="Loading documentation" />,
    );
  }
  if (pages.length === 0) {
    return withLeading(
      <StateMessage
        title="No documentation published yet"
        detail={
          subpath
            ? `Nothing has been published under "${subpath}" in ${bundleId}.`
            : `${bundleId} has no pages in this channel.`
        }
      />,
    );
  }

  // Not in the navigation: that is a collapsed disclosure on narrow layouts,
  // which hid the version (and any way to change it) behind "Pages".
  const channelPicker = onChannelChange && (
    <div className="colophon-layout-toolbar-picker">
      <ChannelPicker
        bundleId={bundleId}
        current={resolved.channel}
        onChange={onChannelChange}
      />
    </div>
  );

  // Asks ColophonToc's own question, so no empty column wrapper is rendered
  // for a page the TOC would render nothing for.
  const hasToc =
    page !== undefined && tocEntries(page.headings, 3, page.title).length > 0;

  const navigation = (
    <ColophonNav
      nodes={nav}
      activeSlug={activeSlug}
      hrefForSlug={hrefForSlug}
    />
  );

  return (
    // The container the stylesheet's container queries measure. Column counts
    // live in CSS; only the disclosure's open state needs JavaScript, and it
    // reads the same width so the two cannot disagree.
    <div className="colophon-layout-container" ref={containerRef}>
      {/* The reader sits below the app's own sidebar and header, so a skip
          link here skips the page navigation, not the whole app. A click
          moves focus by hand because an href fragment would be taken by the
          router and the anchor-scroll hook as a heading link. */}
      <a
        className="colophon-skip-link"
        href={`#${mainId}`}
        onClick={event => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      {leading}
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

        <div
          className="colophon-layout-main"
          id={mainId}
          ref={mainRef}
          tabIndex={-1}
          // Focus lands here from the skip link; it is a destination, not a
          // control, so it should not draw a focus ring of its own.
          style={{ outline: 'none' }}
        >
          {/* The "On this page" disclosure sits in the content column, after
              Pages in reading order, and is shown by the stylesheet only while
              the sidebar column is not, so the links are never present twice. */}
          <div className="colophon-layout-toolbar">
            {hasToc && page && (
              <ColophonToc
                variant="disclosure"
                headings={page.headings}
                pageTitle={page.title}
              />
            )}
            {channelPicker}
          </div>
          {!page && slug !== undefined && (
            <StateMessage
              variant="notFound"
              title="This page doesn't exist"
              detail="It may have been moved or removed in this version."
              actions={
                <Link href={`${pathname}${hrefForSlug('')}`}>
                  Go to the start page
                </Link>
              }
            />
          )}
          {page && (
            <ColophonPageHeader
              title={page.title}
              description={page.description}
              type={page.type}
              status={page.status}
              updatedAt={resolved.updatedAt}
              editUrl={sourceLinks?.editUrl}
              sourceUrl={sourceLinks?.viewUrl}
            />
          )}
          {pageError &&
            (httpStatus(pageError) === 404 ? (
              <StateMessage
                variant="notFound"
                title="This page doesn't exist"
                detail="It may have been moved or removed in this version."
                actions={
                  <Link href={`${pathname}${hrefForSlug('')}`}>
                    Go to the start page
                  </Link>
                }
              />
            ) : (
              <StateMessage
                title="Could not load this page"
                error={pageError}
                onRetry={() => setAttempt(count => count + 1)}
              />
            ))}
          {page && markdown === undefined && !pageError && (
            <ColophonSkeleton variant="page" label="Loading page" />
          )}
          {markdown !== undefined && (
            // Relative links and images resolve against the page they were
            // written on, which the renderer cannot know on its own.
            <PageMarkdown
              context={markdownContext}
              content={markdown}
              pageTitle={page?.title}
            />
          )}
        </div>

        {hasToc && page && (
          <div className="colophon-layout-toc">
            <ColophonToc headings={page.headings} pageTitle={page.title} />
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
