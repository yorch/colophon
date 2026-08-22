import { Link } from '@backstage/core-components';
import type {
  ResultHighlight,
  SearchDocument,
} from '@backstage/plugin-search-common';
import { HighlightedSearchResultText } from '@backstage/plugin-search-react';
import { Box, Text } from '@backstage/ui';

/** What the collator adds on top of the standard search document. */
type ColophonResult = SearchDocument & {
  breadcrumb?: string[];
  pageTitle?: string;
};

/**
 * A Colophon chunk in Backstage's own search results.
 *
 * Without this, documentation falls through to the generic renderer: a title
 * and a body, with no indication of which page or section it came from. A
 * chunk is a SECTION of a page, so the breadcrumb is what makes a result
 * legible — "Architecture" above "Chunking" answers a question the title
 * alone cannot, especially when several pages share a heading like "Storage".
 */
export function ColophonSearchResultItem(props: {
  result?: SearchDocument;
  highlight?: ResultHighlight;
}) {
  const result = props.result as ColophonResult | undefined;
  if (!result) {
    return null;
  }

  // The last entry is the matched section itself, which the title already is.
  const trail = (result.breadcrumb ?? []).slice(0, -1);
  const { highlight } = props;

  // Query terms come back wrapped in the engine's own tags, and rendering the
  // raw string would print those tags as text. Falling back to the plain
  // field matters as much: not every engine returns highlights, and a result
  // with no snippet at all is worse than one without emphasis.
  const highlighted = (field: 'title' | 'text', fallback: string) =>
    highlight?.fields?.[field] ? (
      <HighlightedSearchResultText
        text={highlight.fields[field]}
        preTag={highlight.preTag}
        postTag={highlight.postTag}
      />
    ) : (
      fallback
    );

  return (
    <Box style={{ paddingBlock: 'var(--bui-space-2)' }}>
      <Link to={result.location}>{highlighted('title', result.title)}</Link>
      {trail.length > 0 && (
        <Text variant="body-small" color="secondary" as="div">
          {trail.join(' › ')}
        </Text>
      )}
      <Text variant="body-small" color="secondary" as="div">
        {highlighted('text', result.text)}
      </Text>
    </Box>
  );
}
