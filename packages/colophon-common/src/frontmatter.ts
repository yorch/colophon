/**
 * Where a page's frontmatter ends and its body begins.
 *
 * This lives in the contract rather than in each consumer because the
 * publisher and the backend must agree exactly. The publisher validates
 * heading anchors against its parse of the body; the backend cuts retrieval
 * chunks from its own. If the two disagree about where the body starts, the
 * publisher blesses deep links to anchors the backend never produces — and
 * nothing fails loudly, the links just go nowhere.
 *
 * The closing delimiter must be alone on its line. `gray-matter` closes on a
 * bare `\n---` substring instead, so it treats `--- foo` as a close where
 * this does not; that difference is exactly the divergence this exists to
 * remove.
 */
const FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface SplitMarkdown {
  /** Raw YAML between the delimiters, or undefined when there is none. */
  frontmatter?: string;
  /** Everything after the closing delimiter. */
  body: string;
}

export function splitFrontmatter(markdown: string): SplitMarkdown {
  const match = FRONTMATTER.exec(markdown);
  if (!match) {
    // A leading BOM would otherwise survive into the body and turn the first
    // heading into something remark does not recognise.
    return { body: markdown.replace(/^﻿/, '') };
  }
  return {
    frontmatter: match[1],
    body: markdown.slice(match[0].length),
  };
}

/** Convenience for callers that only want the body. */
export function stripFrontmatter(markdown: string): string {
  return splitFrontmatter(markdown).body;
}
