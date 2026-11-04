import { Link, Text } from '@backstage/ui';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';
import { MermaidDiagram } from './components/MermaidDiagram';
import { useColophonStyles } from './styles';
import type {
  BlockquoteProps,
  CodeBlockProps,
  CodeProps,
  HeadingProps,
  ImageProps,
  LinkProps,
  ListItemProps,
  ListProps,
  ParagraphProps,
  ResolvedColophonComponents,
  TableCellProps,
  TableHeadProps,
  TableProps,
  TableRowProps,
} from './types';
import { scrollRegionProps, useScrollEdges } from './useScrollEdges';

const HEADING_TAGS = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
} as const;

const HEADING_VARIANTS = {
  // The page's own title (ColophonPageHeader) is title-large, so a body
  // heading must be strictly smaller than it at every level. h1 is mapped for
  // overrides and direct callers; the markdown renderer demotes a body h1 to
  // depth 2 before it gets here.
  1: 'title-large',
  2: 'title-medium',
  3: 'title-small',
  4: 'title-x-small',
  // Never below body size (16px): body-medium here made h6 14px, smaller than
  // the paragraph under it. h5 and h6 are told apart by colour instead.
  5: 'body-large',
  6: 'body-large',
} as const;

function DefaultCode({ value }: CodeProps) {
  useColophonStyles();
  return <code className="colophon-code-inline">{value}</code>;
}

const COPIED_RESET_MS = 2000;

function DefaultCodeBlock({ language, value }: CodeBlockProps) {
  useColophonStyles();
  const preRef = useRef<HTMLPreElement>(null);
  const edges = useScrollEdges(preRef);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (copy === 'idle') {
      return undefined;
    }
    const timer = setTimeout(() => setCopy('idle'), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copy]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopy('copied');
    } catch {
      // Unavailable outside a secure context or when permission is refused.
      // Saying so beats a button that silently does nothing.
      setCopy('failed');
    }
  };

  return (
    <div className="colophon-code">
      <div className="colophon-code-bar">
        <span className="colophon-code-language">{language}</span>
        <button
          type="button"
          className="colophon-code-copy"
          onClick={onCopy}
          aria-label={language ? `Copy ${language} code` : 'Copy code'}
        >
          {copy === 'copied'
            ? 'Copied'
            : copy === 'failed'
              ? 'Copy failed'
              : 'Copy'}
        </button>
        {/* Announced separately: the button's own label changing is not
            reliably spoken, and its name must stay stable. */}
        <span className="colophon-visually-hidden" role="status">
          {copy === 'copied' ? 'Code copied to clipboard' : ''}
        </span>
      </div>
      <pre
        ref={preRef}
        className="colophon-code-block colophon-scroll"
        data-language={language || undefined}
        {...scrollRegionProps(edges, language ? `${language} code` : 'Code')}
      >
        <code className={language ? `language-${language}` : undefined}>
          {value}
        </code>
      </pre>
    </div>
  );
}

function DefaultLink({ href, title, children }: LinkProps) {
  useColophonStyles();
  // An in-page anchor stays a plain anchor so the browser scrolls natively;
  // routing it would resolve `#anchor` against the current path instead.
  // It is a body link, not a table-of-contents entry: it used to borrow the
  // ToC's grey, underline-free style, which made a link inside a paragraph
  // indistinguishable from the sidebar's.
  if (href?.startsWith('#')) {
    return (
      <a className="colophon-link" href={href} title={title}>
        {children}
      </a>
    );
  }
  // Anything that is not same-origin-relative opens away from the portal, so it
  // gets the usual reverse-tabnabbing guard.
  const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(href ?? '');
  return (
    <Link
      href={href}
      title={title}
      {...(isExternal
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : undefined)}
    >
      {children}
    </Link>
  );
}

function DefaultImage({ src, alt, title }: ImageProps) {
  useColophonStyles();
  return (
    <img
      className="colophon-markdown-image"
      src={src}
      alt={alt}
      title={title}
    />
  );
}

function DefaultHeading({ depth, id, children }: HeadingProps) {
  useColophonStyles();
  const heading = (
    <Text
      as={HEADING_TAGS[depth]}
      id={id}
      variant={HEADING_VARIANTS[depth]}
      weight="bold"
      color={depth === 6 ? 'secondary' : undefined}
    >
      {children}
    </Text>
  );
  if (!id) {
    return heading;
  }
  // The link is a SIBLING of the heading, not inside it: inside, its label
  // would become part of the heading's accessible name, and every heading in
  // the page would read "Title Link to this section".
  return (
    <div className={`colophon-heading colophon-heading-${depth}`}>
      {heading}
      <a
        className="colophon-heading-anchor"
        href={`#${id}`}
        aria-label="Link to this section"
      >
        #
      </a>
    </div>
  );
}

function DefaultParagraph({ children }: ParagraphProps) {
  return <p>{children}</p>;
}

function DefaultBlockquote({ children }: BlockquoteProps) {
  return <blockquote>{children}</blockquote>;
}

function DefaultList({ ordered, start, children }: ListProps) {
  return ordered ? <ol start={start}>{children}</ol> : <ul>{children}</ul>;
}

function DefaultListItem({ id, className, children }: ListItemProps) {
  return (
    <li id={id} className={className}>
      {children}
    </li>
  );
}

function DefaultTableHead({ children }: TableHeadProps) {
  return <thead>{children}</thead>;
}

function DefaultTableRow({ children }: TableRowProps) {
  return <tr>{children}</tr>;
}

function DefaultTableCell({ header, align, children }: TableCellProps) {
  // Inline rather than a class, because it has to beat the stylesheet's
  // `text-align: start` on every cell that did not ask for an alignment.
  const style = align ? { textAlign: align } : undefined;
  return header ? (
    <th style={style}>{children}</th>
  ) : (
    <td style={style}>{children}</td>
  );
}

function DefaultTable({ children }: TableProps) {
  useColophonStyles();
  const ref = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(ref);
  // Wide reference tables are the norm in docs; scrolling the table instead of
  // the page keeps the layout intact on narrow viewports.
  return (
    <div
      ref={ref}
      className="colophon-markdown-table-scroll colophon-scroll"
      {...scrollRegionProps(edges, 'Table')}
    >
      <table>{children}</table>
    </div>
  );
}

/**
 * Language handlers registered out of the box.
 *
 * Mermaid is here rather than inside the renderer so that it is replaceable and
 * removable like any other handler.
 */
export const defaultCodeLanguages: Record<
  string,
  ComponentType<CodeBlockProps>
> = {
  mermaid: MermaidDiagram,
};

export const defaultColophonComponents: ResolvedColophonComponents = {
  code: DefaultCode,
  codeBlock: DefaultCodeBlock,
  link: DefaultLink,
  image: DefaultImage,
  heading: DefaultHeading,
  paragraph: DefaultParagraph,
  blockquote: DefaultBlockquote,
  list: DefaultList,
  listItem: DefaultListItem,
  table: DefaultTable,
  tableHead: DefaultTableHead,
  tableRow: DefaultTableRow,
  tableCell: DefaultTableCell,
  codeLanguages: defaultCodeLanguages,
};
