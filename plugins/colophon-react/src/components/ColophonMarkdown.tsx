import { stripFrontmatter } from '@brnby/colophon-common';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { Children, isValidElement, useMemo } from 'react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { useColophonComponents } from '../registry';
import type { SanitizeSchema } from '../sanitizeSchema';
import { colophonSanitizeSchema } from '../sanitizeSchema';
import { useColophonStyles } from '../styles';
import type { CodeBlockProps, TableCellProps } from '../types';

type MarkdownProps = ComponentProps<typeof Markdown>;

/**
 * A list of unified plugins, exactly as react-markdown accepts it.
 *
 * Spelled as an indexed access rather than importing `PluggableList` from
 * `unified`, which this package does not depend on directly — the type is
 * react-markdown's to define, and taking it from there is what keeps the two
 * from drifting.
 */
export type ColophonPluginList = NonNullable<MarkdownProps['remarkPlugins']>;

export interface ColophonMarkdownProps {
  /** Markdown source, as published. */
  content: string;
  /** Added to the wrapper, for consumers that want their own prose rules. */
  className?: string;
  /**
   * Remark plugins, appended after `remark-gfm`.
   *
   * These run on the Markdown syntax tree, so anything they emit still passes
   * through the sanitiser afterwards. That is the good case and the trap in
   * one: a plugin that emits an element or attribute the schema does not
   * allow gets it stripped, and the page renders as if the plugin were never
   * installed. Pair such a plugin with a widened {@link sanitizeSchema}.
   *
   * Memoise the array. A new identity each render makes react-markdown
   * reprocess the whole document.
   */
  remarkPlugins?: ColophonPluginList;
  /**
   * Rehype plugins, appended after `rehype-sanitize` and `rehype-slug`.
   *
   * Appended, so they run AFTER sanitisation and their output is not checked
   * — which is what a syntax highlighter or an id-decorator needs, and is
   * only safe because these are the adopter's own code. Page content is the
   * untrusted input here, not the plugin list; a rehype plugin that lifts raw
   * strings out of the tree and reinserts them as HTML hands that input the
   * one thing sanitisation took away. `rehype-raw` is exactly that plugin.
   */
  rehypePlugins?: ColophonPluginList;
  /**
   * The `rehype-sanitize` schema, defaulting to `colophonSanitizeSchema`.
   *
   * Extend the default rather than replacing it — page bodies come from
   * arbitrary repositories, so this is a security boundary, and the shipped
   * schema is GitHub's allow-list plus the three things the renderer needs.
   * Widening it is how a remark plugin's new elements survive to the DOM.
   * Do not reach for `rehype-raw` instead; see {@link rehypePlugins}.
   */
  sanitizeSchema?: SanitizeSchema;
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
  remarkPlugins,
  rehypePlugins,
  sanitizeSchema = colophonSanitizeSchema,
}: ColophonMarkdownProps) {
  const overrides = useColophonComponents();

  // Pages are stored whole, frontmatter included, so the renderer strips it
  // for the same reason the publisher and the chunker do — and using the
  // same shared function, so all three agree on where a body begins.
  // Without this, remark reads the YAML block as a thematic break followed
  // by a setext heading, and every page displays its own frontmatter as a
  // second-level heading that rehype-slug then gives an id to, putting the
  // rendered heading set out of step with the manifest the ToC is built from.
  const body = useMemo(() => stripFrontmatter(content), [content]);

  useColophonStyles();

  const components = useMemo<Components>(() => {
    const {
      code: Code,
      codeBlock: CodeBlock,
      link: LinkComponent,
      image: ImageComponent,
      heading: Heading,
      paragraph: Paragraph,
      blockquote: Blockquote,
      list: ListComponent,
      listItem: ListItem,
      table: TableComponent,
      tableHead: TableHead,
      tableRow: TableRow,
      tableCell: TableCell,
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
      p({ children }) {
        return <Paragraph>{children}</Paragraph>;
      },
      blockquote({ children }) {
        return <Blockquote>{children}</Blockquote>;
      },
      ul({ children }) {
        return <ListComponent ordered={false}>{children}</ListComponent>;
      },
      ol({ start, children }) {
        // `start` is absent unless the list is numbered from something other
        // than 1, and null-vs-undefined is react-markdown's, not ours.
        return (
          <ListComponent ordered start={start ?? undefined}>
            {children}
          </ListComponent>
        );
      },
      li({ className: itemClassName, children }) {
        return <ListItem className={itemClassName}>{children}</ListItem>;
      },
      table({ children }) {
        return <TableComponent>{children}</TableComponent>;
      },
      thead({ children }) {
        return <TableHead>{children}</TableHead>;
      },
      tr({ children }) {
        return <TableRow>{children}</TableRow>;
      },
      th({ style, children }) {
        return (
          <TableCell header align={readAlign(style)}>
            {children}
          </TableCell>
        );
      },
      td({ style, children }) {
        return (
          <TableCell header={false} align={readAlign(style)}>
            {children}
          </TableCell>
        );
      },
      h1: renderHeading(1),
      h2: renderHeading(2),
      h3: renderHeading(3),
      h4: renderHeading(4),
      h5: renderHeading(5),
      h6: renderHeading(6),
    };
  }, [overrides]);

  const remark = useMemo<ColophonPluginList>(
    () =>
      remarkPlugins ? [...REMARK_PLUGINS, ...remarkPlugins] : REMARK_PLUGINS,
    [remarkPlugins],
  );

  /**
   * Sanitisation runs BEFORE slugging on purpose.
   *
   * The sanitiser treats `id` as clobberable and rewrites it to
   * `user-content-<id>`. Slugging afterwards leaves heading ids untouched, so
   * they match the `anchor` values the manifest recorded and
   * table-of-contents links resolve. Adopter plugins go after both, so a
   * plugin cannot displace that pair by being passed in.
   */
  const rehype = useMemo<ColophonPluginList>(
    () => [
      [rehypeSanitize, sanitizeSchema],
      rehypeSlug,
      ...(rehypePlugins ?? []),
    ],
    [sanitizeSchema, rehypePlugins],
  );

  return (
    <div
      className={
        className ? `colophon-markdown ${className}` : 'colophon-markdown'
      }
    >
      <Markdown
        remarkPlugins={remark}
        rehypePlugins={rehype}
        components={components}
      >
        {body}
      </Markdown>
    </div>
  );
}

const REMARK_PLUGINS: ColophonPluginList = [remarkGfm];

const ALIGNMENTS = ['left', 'center', 'right'] as const;

/**
 * Recovers GFM column alignment from the cell's inline style.
 *
 * remark-rehype records it as an `align` attribute, but react-markdown hands
 * components the React form of the properties, where that has already become
 * `style={{ textAlign }}` — so the attribute name never appears in props.
 */
function readAlign(style: CSSProperties | undefined): TableCellProps['align'] {
  return ALIGNMENTS.find(alignment => alignment === style?.textAlign);
}

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
