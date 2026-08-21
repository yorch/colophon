import { Link, Text } from '@backstage/ui';
import type { ComponentType } from 'react';
import { MermaidDiagram } from './components/MermaidDiagram';
import type {
  CodeBlockProps,
  CodeProps,
  HeadingProps,
  ImageProps,
  LinkProps,
  ResolvedColophonComponents,
  TableProps,
} from './types';

const HEADING_TAGS = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
} as const;

const HEADING_VARIANTS = {
  1: 'title-large',
  2: 'title-medium',
  3: 'title-small',
  4: 'title-x-small',
  5: 'body-large',
  6: 'body-medium',
} as const;

function DefaultCode({ value }: CodeProps) {
  return <code className="colophon-code-inline">{value}</code>;
}

function DefaultCodeBlock({ language, value }: CodeBlockProps) {
  return (
    <pre className="colophon-code-block" data-language={language || undefined}>
      <code className={language ? `language-${language}` : undefined}>
        {value}
      </code>
    </pre>
  );
}

function DefaultLink({ href, title, children }: LinkProps) {
  // An in-page anchor stays a plain anchor so the browser scrolls natively;
  // routing it would resolve `#anchor` against the current path instead.
  if (href?.startsWith('#')) {
    return (
      <a className="colophon-toc-link" href={href} title={title}>
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
  return (
    <Text
      as={HEADING_TAGS[depth]}
      id={id}
      variant={HEADING_VARIANTS[depth]}
      weight="bold"
    >
      {children}
    </Text>
  );
}

function DefaultTable({ children }: TableProps) {
  // Wide reference tables are the norm in docs; scrolling the table instead of
  // the page keeps the layout intact on narrow viewports.
  return (
    <div className="colophon-markdown-table-scroll">
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
  table: DefaultTable,
  codeLanguages: defaultCodeLanguages,
};
