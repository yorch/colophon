import type {
  ResultHighlight,
  SearchDocument,
} from '@backstage/plugin-search-common';
import { Box, Link, Text } from '@backstage/ui';
import type { CSSProperties, ReactNode } from 'react';

/** What the collator adds on top of the standard search document. */
type ColophonResult = SearchDocument & {
  bundleId?: string;
  breadcrumb?: string[];
  pageTitle?: string;
};

/**
 * Tags a search engine may leave in a field that are NOT its highlight tags.
 *
 * Seen in the wild as `<284a1ec5-…>word</284a1ec5-…>`: a per-request random
 * token, of which only some occurrences were matched up. Anything shaped like
 * a UUID-led tag is engine plumbing, never documentation text, so it is
 * dropped rather than printed.
 *
 * Applied only AFTER the text has been split on the engine's real tags. Lunr's
 * highlight tags are themselves `<${randomUUID()}>` and `</…>`, so stripping
 * first — as this once did — deleted every genuine highlight along with the
 * strays.
 */
const STRAY_TAG = /<\/?[0-9a-f]{8}-[^<>\s]*>/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const tidy = (text: string) => text.replace(STRAY_TAG, '').replace(/\s+/g, ' ');

/**
 * Turns an engine-highlighted string into React nodes.
 *
 * Deliberately not `dangerouslySetInnerHTML` and not a general HTML parser:
 * the only markup honoured is the one pair of tags the engine said it used,
 * and everything else is text. An unmatched opening tag highlights nothing
 * rather than swallowing the rest of the snippet. Other angle brackets are
 * ordinary text (`a < b`, `Array<string>`) and survive.
 */
export function renderHighlighted(
  text: string,
  preTag?: string,
  postTag?: string,
): ReactNode {
  if (!preTag || !postTag || preTag === postTag) {
    return tidy(text).trim();
  }

  const splitter = new RegExp(
    `(${escapeRegExp(preTag)}|${escapeRegExp(postTag)})`,
  );
  const parts = text.split(splitter);
  const nodes: ReactNode[] = [];
  let open: string | undefined;
  let key = 0;

  for (const part of parts) {
    if (part === preTag) {
      // A second opener without a closer: the first one never matched.
      if (open !== undefined) {
        nodes.push(open);
      }
      open = '';
    } else if (part === postTag) {
      if (open !== undefined) {
        if (open) {
          key += 1;
          nodes.push(<mark key={key}>{open}</mark>);
        }
        open = undefined;
      }
      // A closer with no opener is dropped.
    } else if (open !== undefined) {
      open += tidy(part);
    } else if (part) {
      nodes.push(tidy(part));
    }
  }
  if (open) {
    nodes.push(open);
  }

  // Trim the snippet's outer edges only: trimming each piece would eat the
  // space between a word and the highlight beside it.
  const first = nodes[0];
  if (typeof first === 'string') {
    nodes[0] = first.trimStart();
  }
  const last = nodes[nodes.length - 1];
  if (typeof last === 'string') {
    nodes[nodes.length - 1] = last.trimEnd();
  }
  return nodes;
}

/**
 * Sections run to many lines, and a result list is for scanning. Clamped in
 * CSS rather than by cutting the string, so the highlighted match is never
 * sliced in half and the full text stays available to assistive technology.
 */
const SNIPPET_STYLE: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  overflow: 'hidden',
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

  // Which repository it came from leads the trail: several repositories can
  // each have an "Architecture" page, and the heading trail alone cannot tell
  // them apart. The last breadcrumb entry is the matched section itself,
  // which the title already is.
  const trail = [
    ...(result.bundleId ? [result.bundleId] : []),
    ...(result.breadcrumb ?? []).slice(0, -1),
  ];
  const { highlight } = props;

  // Query terms come back wrapped in the engine's own tags, and rendering the
  // raw string would print those tags as text. Falling back to the plain
  // field matters as much: not every engine returns highlights, and a result
  // with no snippet at all is worse than one without emphasis.
  const highlighted = (field: 'title' | 'text', fallback: string) =>
    renderHighlighted(
      highlight?.fields?.[field] ?? fallback,
      highlight?.preTag,
      highlight?.postTag,
    );

  return (
    <Box style={{ paddingBlock: 'var(--bui-space-2)' }}>
      <Link href={result.location}>{highlighted('title', result.title)}</Link>
      {trail.length > 0 && (
        <Text variant="body-small" color="secondary" as="div">
          {trail.join(' › ')}
        </Text>
      )}
      <Text
        variant="body-small"
        color="secondary"
        as="div"
        style={SNIPPET_STYLE}
      >
        {highlighted('text', result.text)}
      </Text>
    </Box>
  );
}
