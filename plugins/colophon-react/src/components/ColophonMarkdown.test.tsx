import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { ColophonComponentsProvider } from '../registry';
import type { SanitizeSchema } from '../sanitizeSchema';
import { colophonSanitizeSchema } from '../sanitizeSchema';
import type {
  BlockquoteProps,
  CodeBlockProps,
  CodeProps,
  LinkProps,
  ListItemProps,
  ListProps,
  ParagraphProps,
  TableCellProps,
  TableHeadProps,
  TableRowProps,
} from '../types';
import { ColophonMarkdown } from './ColophonMarkdown';

describe('ColophonMarkdown', () => {
  it('renders headings, paragraphs and gfm tables', async () => {
    await renderInTestApp(
      <ColophonMarkdown
        content={[
          '# Payments API',
          '',
          'Some **bold** prose.',
          '',
          '| Option | Default |',
          '| --- | --- |',
          '| `retries` | 3 |',
        ].join('\n')}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Payments API' }),
    ).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Option' }),
    ).toBeInTheDocument();
  });

  it('gives headings anchor ids that survive sanitisation unprefixed', async () => {
    await renderInTestApp(
      <ColophonMarkdown content={'## Rotating credentials\n'} />,
    );

    const heading = screen.getByRole('heading', {
      name: 'Rotating credentials',
    });
    // Not `user-content-rotating-credentials`: sanitising before slugging is
    // what keeps these ids equal to the manifest's recorded anchors.
    expect(heading).toHaveAttribute('id', 'rotating-credentials');
  });

  describe('sanitisation', () => {
    it('does not render a script tag from raw html in the source', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown
          content={'Before\n\n<script>window.pwned = true;</script>\n\nAfter'}
        />,
      );

      expect(container.querySelector('script')).toBeNull();
      expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(screen.getByText('After')).toBeInTheDocument();
    });

    it('does not render an inline event handler smuggled through html', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown content={'<img src="x" onerror="window.pwned=1">'} />,
      );

      expect(container.querySelector('[onerror]')).toBeNull();
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('drops a javascript: link protocol', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown content={'[click me](javascript:alert(1))'} />,
      );

      const anchor = container.querySelector('a');
      expect(anchor?.getAttribute('href') ?? '').not.toContain('javascript:');
    });
  });

  describe('inline versus block code', () => {
    it('renders a backtick span as inline code, not a block', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown content={'Set `retries` to 3.'} />,
      );

      const code = screen.getByText('retries');
      expect(code.tagName).toBe('CODE');
      expect(code).toHaveClass('colophon-code-inline');
      expect(container.querySelector('pre')).toBeNull();
    });

    it('renders a fenced block as a block, not inline', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown content={'```ts\nconst a = 1;\n```'} />,
      );

      const pre = container.querySelector('pre');
      expect(pre).toHaveClass('colophon-code-block');
      expect(pre).toHaveAttribute('data-language', 'ts');
      expect(pre).toHaveTextContent('const a = 1;');
      expect(container.querySelector('.colophon-code-inline')).toBeNull();
    });

    it('treats a fence with no language as a block', async () => {
      // The v9-era `language-*` heuristic misclassifies this one as inline,
      // which is exactly why the renderer dispatches on `pre` instead.
      const { container } = await renderInTestApp(
        <ColophonMarkdown content={'```\nplain text\n```'} />,
      );

      const pre = container.querySelector('pre');
      expect(pre).toHaveClass('colophon-code-block');
      expect(pre).toHaveTextContent('plain text');
      expect(container.querySelector('.colophon-code-inline')).toBeNull();
    });
  });

  describe('component overrides', () => {
    it('uses an overridden inline code component', async () => {
      const CustomCode = ({ value }: CodeProps) => (
        <span data-testid="custom-code">{value.toUpperCase()}</span>
      );

      await renderInTestApp(
        <ColophonComponentsProvider components={{ code: CustomCode }}>
          <ColophonMarkdown content={'Set `retries` to 3.'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('custom-code')).toHaveTextContent('RETRIES');
    });

    it('uses an overridden link component', async () => {
      const CustomLink = ({ href, children }: LinkProps) => (
        <a data-testid="custom-link" href={`/portal${href}`}>
          {children}
        </a>
      );

      await renderInTestApp(
        <ColophonComponentsProvider components={{ link: CustomLink }}>
          <ColophonMarkdown content={'[guides](/guides)'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('custom-link')).toHaveAttribute(
        'href',
        '/portal/guides',
      );
    });

    it('routes a fence to a registered language handler', async () => {
      const Plant = ({ language, value }: CodeBlockProps) => (
        <div data-testid="plantuml">{`${language}:${value}`}</div>
      );

      await renderInTestApp(
        <ColophonComponentsProvider
          components={{ codeLanguages: { plantuml: Plant } }}
        >
          <ColophonMarkdown content={'```plantuml\n@startuml\n```'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('plantuml')).toHaveTextContent(
        'plantuml:@startuml',
      );
    });

    it('leaves unregistered languages on the default code block', async () => {
      const Plant = () => <div data-testid="plantuml" />;

      const { container } = await renderInTestApp(
        <ColophonComponentsProvider
          components={{ codeLanguages: { plantuml: Plant } }}
        >
          <ColophonMarkdown content={'```ts\nconst a = 1;\n```'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.queryByTestId('plantuml')).toBeNull();
      expect(container.querySelector('pre')).toHaveClass('colophon-code-block');
    });
  });

  describe('block-level overrides', () => {
    it('uses an overridden blockquote, which is what admonitions need', async () => {
      const Callout = ({ children }: BlockquoteProps) => (
        <aside data-testid="callout">{children}</aside>
      );

      const { container } = await renderInTestApp(
        <ColophonComponentsProvider components={{ blockquote: Callout }}>
          <ColophonMarkdown content={'> Careful.\n'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('callout')).toHaveTextContent('Careful.');
      expect(container.querySelector('blockquote')).toBeNull();
    });

    it('uses an overridden paragraph', async () => {
      const Lead = ({ children }: ParagraphProps) => (
        <p data-testid="lead">{children}</p>
      );

      await renderInTestApp(
        <ColophonComponentsProvider components={{ paragraph: Lead }}>
          <ColophonMarkdown content={'Just prose.\n'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('lead')).toHaveTextContent('Just prose.');
    });

    it('tells an overridden list whether it is ordered, and where it starts', async () => {
      const Listing = ({ ordered, start, children }: ListProps) => (
        <ol data-testid={ordered ? 'ordered' : 'unordered'} start={start}>
          {children}
        </ol>
      );

      await renderInTestApp(
        <ColophonComponentsProvider components={{ list: Listing }}>
          <ColophonMarkdown content={'- a\n\n<!-- -->\n\n3. c\n'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('unordered')).not.toHaveAttribute('start');
      expect(screen.getByTestId('ordered')).toHaveAttribute('start', '3');
    });

    it('hands a list item the task-list class it would otherwise lose', async () => {
      // An override that drops this renders a checkbox with a bullet beside
      // it, because the rule that hides the marker keys off the class.
      const Item = ({ className, children }: ListItemProps) => (
        <li data-testid="item" className={className}>
          {children}
        </li>
      );

      await renderInTestApp(
        <ColophonComponentsProvider components={{ listItem: Item }}>
          <ColophonMarkdown content={'- [x] done\n'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('item')).toHaveClass('task-list-item');
    });

    it('uses overridden table interior components', async () => {
      const Head = ({ children }: TableHeadProps) => (
        <thead data-testid="head">{children}</thead>
      );
      const Row = ({ children }: TableRowProps) => (
        <tr data-testid="row">{children}</tr>
      );
      const Cell = ({ header, align, children }: TableCellProps) =>
        header ? (
          <th data-testid="header-cell" style={{ textAlign: align }}>
            {children}
          </th>
        ) : (
          <td data-testid="body-cell" style={{ textAlign: align }}>
            {children}
          </td>
        );

      await renderInTestApp(
        <ColophonComponentsProvider
          components={{ tableHead: Head, tableRow: Row, tableCell: Cell }}
        >
          <ColophonMarkdown content={'| Option |\n| --: |\n| `retries` |\n'} />
        </ColophonComponentsProvider>,
      );

      expect(screen.getByTestId('head')).toBeInTheDocument();
      expect(screen.getAllByTestId('row')).toHaveLength(2);
      // The GFM delimiter row's alignment reaches the override, which is the
      // only place it can be honoured — the shipped stylesheet's
      // `text-align: start` beats the `align` attribute the default emits.
      expect(screen.getByTestId('header-cell')).toHaveStyle({
        textAlign: 'right',
      });
      expect(screen.getByTestId('body-cell')).toBeInTheDocument();
    });
  });

  /**
   * The pair of props from the same change, tested together on purpose.
   *
   * A remark plugin emits into the Markdown tree, which is UPSTREAM of the
   * sanitiser — so a plugin whose output the schema does not allow is
   * stripped on the way out and the page renders as though the plugin were
   * never passed. Shipping `remarkPlugins` without `sanitizeSchema` would be
   * an extension point that silently does nothing, so both directions are
   * asserted here.
   */
  describe('pipeline extension', () => {
    /** Turns every blockquote into an `<aside class="admonition">`. */
    const remarkAdmonition = () => (tree: unknown) => {
      const visit = (node: unknown): void => {
        if (typeof node !== 'object' || node === null) {
          return;
        }
        const element = node as {
          type?: string;
          data?: Record<string, unknown>;
          children?: unknown[];
        };
        if (element.type === 'blockquote') {
          element.data = {
            ...element.data,
            hName: 'aside',
            hProperties: { className: ['admonition'] },
          };
        }
        for (const child of element.children ?? []) {
          visit(child);
        }
      };
      visit(tree);
    };

    /**
     * Adds a class to every `em`, downstream of the sanitiser.
     *
     * `em` because it has no override slot: a slot's props are a fixed
     * contract, so anything a rehype plugin hangs on an element the renderer
     * remaps — a heading, a table cell — stops at that contract and never
     * reaches the DOM. Inline formatting passes straight through.
     */
    const rehypeMarkEmphasis = () => (tree: unknown) => {
      const visit = (node: unknown): void => {
        if (typeof node !== 'object' || node === null) {
          return;
        }
        const element = node as {
          tagName?: string;
          properties?: Record<string, unknown>;
          children?: unknown[];
        };
        if (element.tagName === 'em') {
          element.properties = { ...element.properties, className: ['marked'] };
        }
        for (const child of element.children ?? []) {
          visit(child);
        }
      };
      visit(tree);
    };

    // Annotated, not inferred: an attribute rule is a tuple, and an
    // unannotated object literal widens it to string[][] — which the schema
    // type then rejects.
    const admonitionSchema: SanitizeSchema = {
      ...colophonSanitizeSchema,
      tagNames: [...(colophonSanitizeSchema.tagNames ?? []), 'aside'],
      attributes: {
        ...colophonSanitizeSchema.attributes,
        aside: [['className', 'admonition']],
      },
    };

    it('renders what a remark plugin emits once the schema allows it', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown
          content={'> Rotate the key first.\n'}
          remarkPlugins={[remarkAdmonition]}
          sanitizeSchema={admonitionSchema}
        />,
      );

      const aside = container.querySelector('aside');
      expect(aside).toHaveClass('admonition');
      expect(aside).toHaveTextContent('Rotate the key first.');
    });

    it('strips that same output when the schema is left alone', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown
          content={'> Rotate the key first.\n'}
          remarkPlugins={[remarkAdmonition]}
        />,
      );

      // The text survives — only the element the plugin added is gone, which
      // is why this failure mode reads as "the plugin did not run".
      expect(container.querySelector('aside')).toBeNull();
      expect(screen.getByText('Rotate the key first.')).toBeInTheDocument();
    });

    it('keeps remark-gfm rather than replacing the built-in plugins', async () => {
      await renderInTestApp(
        <ColophonMarkdown
          content={'| Option |\n| --- |\n| a |\n'}
          remarkPlugins={[remarkAdmonition]}
        />,
      );

      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('runs rehype plugins after sanitisation, so their output is kept', async () => {
      await renderInTestApp(
        <ColophonMarkdown
          content={'## Rotating *credentials*\n'}
          rehypePlugins={[rehypeMarkEmphasis]}
        />,
      );

      // A class the sanitiser's allow-list does not permit, kept because the
      // plugin ran after it.
      expect(screen.getByText('credentials')).toHaveClass('marked');
      // And the sanitise/slug pair still ran first: the id is unprefixed,
      // which is what keeps it equal to the manifest's recorded anchor.
      expect(
        screen.getByRole('heading', { name: 'Rotating credentials' }),
      ).toHaveAttribute('id', 'rotating-credentials');
    });

    it('still sanitises with a schema an adopter widened', async () => {
      const { container } = await renderInTestApp(
        <ColophonMarkdown
          content={'<script>window.pwned = true;</script>\n\ntext\n'}
          sanitizeSchema={admonitionSchema}
        />,
      );

      expect(container.querySelector('script')).toBeNull();
    });
  });
});
