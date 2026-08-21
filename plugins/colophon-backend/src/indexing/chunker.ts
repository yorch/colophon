import { createHash } from 'node:crypto';
import {
  type ChunkingOptions,
  DEFAULT_CHUNKING_OPTIONS,
  stripFrontmatter,
} from '@brnby/colophon-common';
import GithubSlugger from 'github-slugger';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 * A chunk as derived from a page body, before it is given a bundle and a
 * revision. Mirrors `Chunk` from colophon-common minus the identity fields
 * the caller owns.
 */
export interface DerivedChunk {
  anchor?: string;
  breadcrumb: string[];
  text: string;
  ordinal: number;
  contentHash: string;
}

/**
 * A run of blocks under one heading, before size rules are applied.
 * `blocks` holds the verbatim markdown source of each top-level node, which
 * is what keeps code fences, tables and lists intact — reconstructing them
 * from the AST would quietly reformat every chunk.
 */
interface Section {
  depth?: number;
  heading?: string;
  anchor?: string;
  breadcrumb: string[];
  /**
   * Content folded in from EARLIER sections that were too short to stand
   * alone. Kept apart from `blocks` so that the section's own heading can be
   * re-inserted in front of its OWN blocks rather than in front of everything
   * merged into it — which emits the page out of order.
   */
  carried: string[];
  blocks: string[];
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Everything the section will emit, in document order. */
function allBlocks(section: Section): string[] {
  return [...section.carried, ...section.blocks];
}

function sectionText(section: Section): string {
  return allBlocks(section).join('\n\n').trim();
}

/** A section's OWN blocks with its OWN heading restored as literal markdown. */
function blocksWithHeading(section: Section): string[] {
  if (!section.heading || section.depth === undefined) {
    return section.blocks;
  }
  return [`${'#'.repeat(section.depth)} ${section.heading}`, ...section.blocks];
}

/**
 * Folds a too-short section into the one that follows it.
 *
 * The result keeps the FOLLOWING section's identity — anchor and breadcrumb —
 * because that is where the content is, and a deep link should land on the
 * heading a reader is looking for. The short section's heading is only
 * re-inserted as text when the next section is not nested beneath it; when it
 * is, the breadcrumb already names it and repeating it would be noise.
 */
function mergeForward(short: Section, next: Section): Section {
  const nested =
    short.depth !== undefined &&
    next.depth !== undefined &&
    next.depth > short.depth;
  const own = nested ? short.blocks : blocksWithHeading(short);
  return { ...next, carried: [...short.carried, ...own] };
}

/**
 * Greedily packs blocks into groups no larger than `maxChars`.
 *
 * A single block larger than the ceiling is emitted alone rather than cut:
 * the ceiling is soft by contract, and slicing through a fenced code block or
 * a table row produces a chunk that is worse than an oversized one.
 */
function packBlocks(blocks: string[], maxChars: number): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let length = 0;

  for (const block of blocks) {
    const cost = current.length === 0 ? block.length : block.length + 2;
    if (current.length > 0 && length + cost > maxChars) {
      groups.push(current);
      current = [];
      length = 0;
    }
    current.push(block);
    length += current.length === 1 ? block.length : block.length + 2;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/** Tail of `text`, trimmed forward to a word boundary so it reads cleanly. */
function overlapTail(text: string, chars: number): string {
  if (chars <= 0 || text.length <= chars) {
    return text;
  }
  const tail = text.slice(-chars);
  const boundary = tail.search(/\s/);
  return boundary === -1 ? tail : tail.slice(boundary + 1);
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Cuts a page body into retrieval chunks.
 *
 * The page `title` heads every breadcrumb, so a chunk read in isolation still
 * says which page it came from. A leading H1 that merely repeats the title is
 * dropped from the trail rather than duplicated.
 */
export function chunkPage(
  input: { title: string; markdown: string },
  options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS,
): DerivedChunk[] {
  const { splitDepths, maxChars, minChars, overlapChars } = options;
  const source = stripFrontmatter(input.markdown);
  const root = parser.parse(source);

  const minSplitDepth =
    splitDepths.length > 0 ? Math.min(...splitDepths) : Number.NaN;
  const startsSection = (depth: number) =>
    splitDepths.length > 0 &&
    (splitDepths.includes(depth) || depth < minSplitDepth);

  const slugger = new GithubSlugger();
  const ancestors: Array<{ depth: number; text: string }> = [];
  const sections: Section[] = [];
  let current: Section = {
    breadcrumb: [input.title],
    carried: [],
    blocks: [],
  };

  for (const node of root.children) {
    if (node.type === 'heading') {
      const text = mdastToString(node).trim();
      // Every heading consumes a slug, split or not, so that duplicate
      // headings get the same `-1` suffixes GitHub and the CLI produce.
      const anchor = slugger.slug(text);
      while (
        ancestors.length > 0 &&
        ancestors[ancestors.length - 1].depth >= node.depth
      ) {
        ancestors.pop();
      }
      const isPageTitle =
        node.depth === 1 &&
        ancestors.length === 0 &&
        normalizeHeading(text) === normalizeHeading(input.title);
      if (!isPageTitle) {
        ancestors.push({ depth: node.depth, text });
      }

      if (startsSection(node.depth)) {
        sections.push(current);
        current = {
          depth: isPageTitle ? undefined : node.depth,
          heading: isPageTitle ? undefined : text,
          anchor: isPageTitle ? undefined : anchor,
          breadcrumb: [input.title, ...ancestors.map(a => a.text)],
          carried: [],
          blocks: [],
        };
        continue;
      }
    }

    const { start, end } = node.position ?? {};
    if (start?.offset !== undefined && end?.offset !== undefined) {
      current.blocks.push(source.slice(start.offset, end.offset));
    }
  }
  sections.push(current);

  const kept: Section[] = [];
  let pending: Section | undefined;
  for (const raw of sections) {
    const section = pending ? mergeForward(pending, raw) : raw;
    pending = undefined;
    if (sectionText(section).length < minChars) {
      pending = section;
      continue;
    }
    kept.push(section);
  }
  if (pending && sectionText(pending).length > 0) {
    const last = kept[kept.length - 1];
    // Nothing follows a trailing short section, so it merges backwards rather
    // than being dropped or left as a chunk too small to retrieve well.
    if (last) {
      last.blocks.push(...pending.carried, ...blocksWithHeading(pending));
    } else {
      kept.push(pending);
    }
  }

  const chunks: DerivedChunk[] = [];
  // Overlap is taken from the previous chunk's OWN text, never from its
  // already-overlapped form, so the repetition does not compound down a page.
  let previous = '';
  for (const section of kept) {
    for (const group of packBlocks(allBlocks(section), maxChars)) {
      const text = group.join('\n\n').trim();
      if (!text) {
        continue;
      }
      const withOverlap =
        overlapChars > 0 && previous
          ? `${overlapTail(previous, overlapChars)}\n\n${text}`
          : text;
      previous = text;
      chunks.push({
        anchor: section.anchor,
        breadcrumb: section.breadcrumb,
        text: withOverlap,
        ordinal: chunks.length,
        contentHash: createHash('sha256').update(withOverlap).digest('hex'),
      });
    }
  }
  return chunks;
}
