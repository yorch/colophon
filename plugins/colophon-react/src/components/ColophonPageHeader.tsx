import { Badge, Flex, Link, Text } from '@backstage/ui';
import type { DocStatus, DocType } from '@brnby/colophon-common';
import { useId } from 'react';
import { useColophonStyles } from '../styles';

export interface ColophonPageHeaderProps {
  title: string;
  description?: string;
  type?: DocType;
  status?: DocStatus;
  /**
   * ISO-8601 timestamp of the revision this page came from.
   *
   * Labelled "Revision updated" because that is what it is: the manifest
   * records one timestamp per revision, not per page, so "Updated" would
   * claim a page-level edit date the data cannot back.
   */
  updatedAt?: string;
  /** "Edit this page" target, derived from the manifest's git source. */
  editUrl?: string;
  /**
   * "View source" target — the same file, not opened for editing.
   *
   * Offered beside the edit link rather than instead of it so a reader who
   * only wants to read the Markdown is not routed through an editor.
   *
   * The equality check below is defensive, not descriptive: every provider
   * that currently produces links gives a distinct edit URL, so it does not
   * fire today. It exists because `ScmIntegrationRegistry.resolveEditUrl`
   * returns its input unchanged for providers with no edit mode, and this
   * component takes both URLs as plain props — so a caller wiring up such a
   * provider would otherwise render two identical links.
   */
  sourceUrl?: string;
}

const FLEX_WRAP = { flexWrap: 'wrap' } as const;

const STATUS_NOTICES: Partial<Record<DocStatus, string>> = {
  deprecated:
    'This page is deprecated. It is kept for reference and may be out of date.',
};

const STATUS_LABELS: Record<DocStatus, string> = {
  current: 'Current',
  draft: 'Draft',
  deprecated: 'Deprecated',
};

/**
 * The masthead for a rendered page.
 *
 * The doc-type chip is not decoration: Diátaxis type is what tells a reader
 * whether they are about to get a tutorial or a reference, and it is the same
 * field agents filter on.
 */
export function ColophonPageHeader({
  title,
  description,
  type,
  status,
  updatedAt,
  editUrl,
  sourceUrl,
}: ColophonPageHeaderProps) {
  useColophonStyles();
  const newTabId = useId();
  // `current` is the default for every page, so badging it would put a chip on
  // every page and tell the reader nothing.
  const showStatus = status !== undefined && status !== 'current';
  const showSource = Boolean(sourceUrl) && sourceUrl !== editUrl;
  const opensNewTab = showSource || Boolean(editUrl);
  const notice = showStatus ? STATUS_NOTICES[status] : undefined;
  return (
    <header className="colophon-page-header">
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2" style={FLEX_WRAP}>
          {/* title-large so the page title outranks every body heading,
              the largest of which is title-medium. */}
          <Text as="h1" variant="title-large" weight="bold">
            {title}
          </Text>
          {/* Both badges in sentence case: the type used to print as the raw
              lowercase value beside a capitalised status. */}
          {type ? <Badge>{sentenceCase(type)}</Badge> : null}
          {/* Wrapped in a span of ours because nothing in Backstage UI styles
              a badge by status, and a data attribute on Badge itself is only
              as reliable as its prop forwarding. */}
          {showStatus ? (
            <span className="colophon-status" data-status={status}>
              <Badge>{STATUS_LABELS[status]}</Badge>
            </span>
          ) : null}
        </Flex>
        {notice ? (
          <div className="colophon-banner colophon-banner-warning" role="note">
            {notice}
          </div>
        ) : null}
        {description ? (
          <Text variant="body-medium" color="secondary">
            {description}
          </Text>
        ) : null}
        <Flex align="center" gap="4" style={FLEX_WRAP}>
          {updatedAt ? (
            <Text variant="body-small" color="secondary">
              Revision updated{' '}
              <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
            </Text>
          ) : null}
          {showSource && sourceUrl ? (
            <Link
              href={sourceUrl}
              variant="body-small"
              aria-describedby={newTabId}
              target="_blank"
              rel="noopener noreferrer"
            >
              View source
              <NewTabGlyph />
            </Link>
          ) : null}
          {editUrl ? (
            <Link
              href={editUrl}
              variant="body-small"
              aria-describedby={newTabId}
              target="_blank"
              rel="noopener noreferrer"
            >
              Edit this page
              <NewTabGlyph />
            </Link>
          ) : null}
          {opensNewTab ? (
            <span className="colophon-visually-hidden" id={newTabId}>
              Opens in a new tab
            </span>
          ) : null}
        </Flex>
      </Flex>
    </header>
  );
}

/**
 * Glyph half of the "opens in a new tab" cue, for sighted readers. The words
 * are one hidden description the links point at with `aria-describedby`, so
 * "Edit this page" stays the link's accessible NAME — what a screen reader's
 * link list shows and what existing queries know it by.
 */
function NewTabGlyph() {
  return (
    <span className="colophon-external-glyph" aria-hidden="true">
      {' \u2197'}
    </span>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
