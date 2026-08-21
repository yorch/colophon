import type { ComponentProps, ReactNode } from 'react';
import { Children, isValidElement, useEffect, useMemo } from 'react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { useColophonComponents } from '../registry';
import { colophonSanitizeSchema } from '../sanitizeSchema';
import { ensureColophonStyles } from '../styles';
import type { CodeBlockProps } from '../types';

type MarkdownProps = ComponentProps<typeof Markdown>;

export interface ColophonMarkdownProps {
  /** Markdown source, as published. */
  content: string;
  /** Added to the wrapper, for consumers that want their own prose rules. */
  className?: string;
}

/**
 * Renders a Colophon page's markdown.
 *
 * The plugin's whole premise is that the canonical artifact stays Markdown and
 * rendering happens at the edge, so this component is where the promise is
 * kept: every block that a consumer might want to restyle routes through the
 * component override registry rather than through CSS aimed at generated HTML.
 */
export function ColophonMarkdown({
  content,
  className,
}: ColophonMarkdownProps) {
  const overrides = useColophonComponents();

  useEffect(() => ensureColophonStyles(), []);

  const components = useMemo<Components>(() => {
    const {
      code: Code,
      codeBlock: CodeBlock,
      link: LinkComponent,
      image: ImageComponent,
      heading: Heading,
      table: TableComponent,
      codeLanguages,
    } = overrides;

    const renderHeading = (depth: 1 | 2 | 3 | 4 | 5 | 6) =>
      function ColophonHeading({
        id,
        children,
      }: {
        id?: string;
        children?: ReactNode;
      }) {
        return (
          <Heading depth={depth} id={id}>
            {children}
          </Heading>
        );
      };

    return {
      /**
       * Fenced blocks are handled entirely here, in `pre`, and deliberately not
       * in `code`. react-markdown v10 dropped the `inline` prop that v9-era
       * examples still reach for, so the only reliable signal left is position
       * in the tree — and `pre` IS that position. Because this renderer never
       * renders `pre`'s children, `code` below is only ever reached by genuine
       * inline spans.
       */
      pre({ children }) {
        const block = readCodeBlock(children);
        if (!block) {
          return <pre>{children}</pre>;
        }
        const LanguageHandler = codeLanguages[block.language];
        return LanguageHandler ? (
          <LanguageHandler {...block} />
        ) : (
          <CodeBlock {...block} />
        );
      },
      code({ className: codeClassName, children }) {
        // Defence in depth: a consumer who overrides `pre` and renders its
        // children brings block code back through here, and a `language-*`
        // class is what distinguishes it.
        if (codeClassName?.includes('language-')) {
          return <code className={codeClassName}>{children}</code>;
        }
        return <Code value={toText(children)} />;
      },
      a({ href, title, children }) {
        return (
          <LinkComponent href={href} title={title}>
            {children}
          </LinkComponent>
        );
      },
      img({ src, alt, title }) {
        return <ImageComponent src={src} alt={alt} title={title} />;
      },
      table({ children }) {
        return <TableComponent>{children}</TableComponent>;
      },
      h1: renderHeading(1),
      h2: renderHeading(2),
      h3: renderHeading(3),
      h4: renderHeading(4),
      h5: renderHeading(5),
      h6: renderHeading(6),
    };
  }, [overrides]);

  return (
    <div
      className={
        className ? `colophon-markdown ${className}` : 'colophon-markdown'
      }
    >
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
}

const REMARK_PLUGINS = [remarkGfm];

/**
 * Sanitisation runs BEFORE slugging on purpose.
 *
 * The sanitiser treats `id` as clobberable and rewrites it to
 * `user-content-<id>`. Slugging afterwards leaves heading ids untouched, so
 * they match the `anchor` values the manifest recorded and table-of-contents
 * links resolve.
 */
const REHYPE_PLUGINS: MarkdownProps['rehypePlugins'] = [
  [rehypeSanitize, colophonSanitizeSchema],
  rehypeSlug,
];

/** Pulls language and source out of the `<code>` element inside a `<pre>`. */
function readCodeBlock(children: ReactNode): CodeBlockProps | undefined {
  const child = Children.toArray(children).find(node => isValidElement(node));
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    return undefined;
  }
  const language = /(?:^|\s)language-([^\s]+)/.exec(
    child.props.className ?? '',
  )?.[1];
  return {
    language: language?.toLowerCase() ?? '',
    value: toText(child.props.children).replace(/\n$/, ''),
  };
}

/** Flattens a React node to its text, which is all code content ever is. */
export function toText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(toText).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return toText(node.props.children);
  }
  return '';
}
