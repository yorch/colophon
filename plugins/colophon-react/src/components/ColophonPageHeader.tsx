import { Badge, Flex, Link, Text } from '@backstage/ui';
import type { DocStatus, DocType } from '@brnby/colophon-common';

export interface ColophonPageHeaderProps {
  title: string;
  description?: string;
  type?: DocType;
  status?: DocStatus;
  /** ISO-8601 timestamp of the revision this page came from. */
  updatedAt?: string;
  /** "Edit this page" target, derived from the manifest's git source. */
  editUrl?: string;
}

const FLEX_WRAP = { flexWrap: 'wrap' } as const;

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
}: ColophonPageHeaderProps) {
  // `current` is the default for every page, so badging it would put a chip on
  // every page and tell the reader nothing.
  const showStatus = status !== undefined && status !== 'current';
  return (
    <header>
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2" style={FLEX_WRAP}>
          <Text as="h1" variant="title-medium" weight="bold">
            {title}
          </Text>
          {type ? <Badge>{type}</Badge> : null}
          {showStatus ? (
            <Badge data-status={status}>{STATUS_LABELS[status]}</Badge>
          ) : null}
        </Flex>
        {description ? (
          <Text variant="body-medium" color="secondary">
            {description}
          </Text>
        ) : null}
        <Flex align="center" gap="4" style={FLEX_WRAP}>
          {updatedAt ? (
            <Text variant="body-small" color="secondary">
              Updated <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
            </Text>
          ) : null}
          {editUrl ? (
            <Link
              href={editUrl}
              variant="body-small"
              target="_blank"
              rel="noopener noreferrer"
            >
              Edit this page
            </Link>
          ) : null}
        </Flex>
      </Flex>
    </header>
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
