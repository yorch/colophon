import { Flex, Link, Text } from '@backstage/ui';

/**
 * One search hit.
 *
 * Deliberately a subset of the backend's retrieval chunk rather than the chunk
 * itself: the renderer needs only what it puts on screen, and staying loose
 * here keeps a change to chunking from rippling into the UI package.
 */
export interface ColophonSearchResult {
  bundleId: string;
  slug: string;
  title: string;
  /** Heading trail from bundle title down to the matched section. */
  breadcrumb: string[];
  /** Snippet of the matched text. */
  text: string;
  anchor?: string;
}

export interface ColophonSearchResultsProps {
  results: ColophonSearchResult[];
  hrefForResult: (result: ColophonSearchResult) => string;
  /** Shown when the query returned nothing. */
  emptyMessage?: string;
}

export function ColophonSearchResults({
  results,
  hrefForResult,
  emptyMessage = 'No documentation matched that query.',
}: ColophonSearchResultsProps) {
  if (results.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        {emptyMessage}
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="5" role="list">
      {results.map(result => (
        <Flex
          key={`${result.bundleId}/${result.slug}#${result.anchor ?? ''}`}
          direction="column"
          gap="1"
          role="listitem"
        >
          <Link href={hrefForResult(result)} variant="body-large" weight="bold">
            {result.title}
          </Link>
          {result.breadcrumb.length > 0 ? (
            <Text variant="body-x-small" color="secondary">
              {result.breadcrumb.join(' › ')}
            </Text>
          ) : null}
          <Text variant="body-small" color="secondary">
            {result.text}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}
