import type { ComponentType, ReactNode } from 'react';

/** Props given to the renderer for an inline `` `code` `` span. */
export interface CodeProps {
  /** Text content of the span. */
  value: string;
}

/**
 * Props given to the renderer for a fenced code block, and to every language
 * handler registered in {@link ColophonComponents.codeLanguages}.
 */
export interface CodeBlockProps {
  /**
   * The fence info string, lowercased. An empty string for a bare ``` fence.
   */
  language: string;
  /** Source of the block, without its trailing newline. */
  value: string;
}

/** Props given to the renderer for a markdown link. */
export interface LinkProps {
  /**
   * The href exactly as authored. Relative hrefs are NOT resolved here —
   * resolution needs routing context the renderer does not have, so consumers
   * that live inside a router override this component to resolve them.
   */
  href?: string;
  title?: string;
  children: ReactNode;
}

/** Props given to the renderer for a markdown image. */
export interface ImageProps {
  src?: string;
  alt?: string;
  title?: string;
}

/** Props given to the renderer for a heading. */
export interface HeadingProps {
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** Anchor id, added by `rehype-slug`. */
  id?: string;
  children: ReactNode;
}

/** Props given to the renderer for a GFM table. */
export interface TableProps {
  children: ReactNode;
}

/** Props given to the renderer for a paragraph. */
export interface ParagraphProps {
  children: ReactNode;
}

/** Props given to the renderer for a blockquote. */
export interface BlockquoteProps {
  children: ReactNode;
}

/** Props given to the renderer for a bulleted or numbered list. */
export interface ListProps {
  /** True for `1.`-style lists, false for `-`-style ones. */
  ordered: boolean;
  /**
   * First number of an ordered list that does not start at 1. Undefined
   * otherwise, including for every unordered list.
   */
  start?: number;
  children: ReactNode;
}

/** Props given to the renderer for a list item. */
export interface ListItemProps {
  /**
   * Anchor id, when something upstream gave the item one — a GFM footnote
   * definition is the case that exists today, and its back-link targets this.
   * Passed through because a slot's props are a fixed contract: an id the
   * component never receives is an id that can never reach the DOM.
   */
  id?: string;
  /**
   * Classes a remark plugin put on the item — `task-list-item` for a GFM
   * checkbox item, which is both the styling hook and the only signal that
   * the item's first child is a checkbox. Passed through because an override
   * that drops it turns every task list back into a bulleted one, silently.
   */
  className?: string;
  children: ReactNode;
}

/** Props given to the renderer for a table's header section (`thead`). */
export interface TableHeadProps {
  children: ReactNode;
}

/** Props given to the renderer for a table row. */
export interface TableRowProps {
  children: ReactNode;
}

/** Props given to the renderer for a table's header or body cell. */
export interface TableCellProps {
  /** True for a `thead` cell, which the default renders as `th`. */
  header: boolean;
  /**
   * Column alignment, from the `:--`/`--:` markers in the delimiter row.
   *
   * Undefined for a column with no marker. The default renders it as an
   * inline `text-align`, which is what it takes to beat the stylesheet's own
   * `text-align: start`; an override that drops it loses GFM alignment.
   */
  align?: 'left' | 'center' | 'right';
  children: ReactNode;
}

/**
 * The renderer's extension points.
 *
 * Every field is optional; anything left out keeps the shipped default. This
 * is the knob that makes Colophon's rendering flexible — adopters replace a
 * component rather than patching CSS at the DOM that TechDocs forces them to.
 *
 * ## Which constructs get a slot
 *
 * The line, so that the next request does not have to be argued from scratch:
 *
 * **Block-level constructs get a slot. Inline formatting does not.**
 *
 * A block is a thing an override may need to *restructure* — read its
 * children and emit something else entirely, which is how a blockquote
 * becomes an admonition and a table becomes a data grid. CSS cannot do that,
 * so a component boundary is the only way to reach it.
 *
 * Inline formatting (`em`, `strong`, `del`, `sup`) is a run of text inside a
 * block. CSS already reaches every one of them through `.colophon-markdown
 * em`, an override could only re-wrap the same text, and a component boundary
 * on every emphasised word costs render work on every page for no capability
 * anyone gained.
 *
 * Three block-level constructs are carved out, and the carve-outs share a
 * reason — there is nothing to restructure:
 *
 * - `hr` has no children at all.
 * - `tbody` is a grouping wrapper with no content of its own.
 * - `section`, which `remark-gfm` generates to hold footnotes, is emitted by
 *   the pipeline rather than authored in Markdown. The rule is about
 *   constructs a writer types.
 *
 * CSS reaches all three, so none has a slot.
 */
export interface ColophonComponents {
  /** Inline `` `code` `` spans. */
  code?: ComponentType<CodeProps>;
  /** Fenced code blocks with no registered language handler. */
  codeBlock?: ComponentType<CodeBlockProps>;
  link?: ComponentType<LinkProps>;
  image?: ComponentType<ImageProps>;
  heading?: ComponentType<HeadingProps>;
  paragraph?: ComponentType<ParagraphProps>;
  /**
   * Blockquotes — the slot admonitions are built on, because `> **Note**` is
   * how almost every Markdown dialect spells one.
   */
  blockquote?: ComponentType<BlockquoteProps>;
  /** Both `ul` and `ol`; `ordered` says which. */
  list?: ComponentType<ListProps>;
  listItem?: ComponentType<ListItemProps>;
  /** The table wrapper, not its interior. */
  table?: ComponentType<TableProps>;
  tableHead?: ComponentType<TableHeadProps>;
  tableRow?: ComponentType<TableRowProps>;
  /** Both `th` and `td`; `header` says which. */
  tableCell?: ComponentType<TableCellProps>;
  /**
   * Renderers keyed by fenced-code language, lowercased.
   *
   * This is why Mermaid is not special-cased anywhere in the renderer: it is
   * simply the handler registered under `mermaid`, and PlantUML or Vega would
   * plug in the same way.
   */
  codeLanguages?: Record<string, ComponentType<CodeBlockProps>>;
}

/** A {@link ColophonComponents} with every default filled in. */
export type ResolvedColophonComponents = Required<ColophonComponents>;
