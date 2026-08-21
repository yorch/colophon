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

/**
 * The renderer's extension points.
 *
 * Every field is optional; anything left out keeps the shipped default. This
 * is the knob that makes Colophon's rendering flexible — adopters replace a
 * component rather than patching CSS at the DOM that TechDocs forces them to.
 */
export interface ColophonComponents {
  /** Inline `` `code` `` spans. */
  code?: ComponentType<CodeProps>;
  /** Fenced code blocks with no registered language handler. */
  codeBlock?: ComponentType<CodeBlockProps>;
  link?: ComponentType<LinkProps>;
  image?: ComponentType<ImageProps>;
  heading?: ComponentType<HeadingProps>;
  table?: ComponentType<TableProps>;
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
