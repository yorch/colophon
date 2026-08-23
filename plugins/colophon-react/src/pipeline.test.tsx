import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import { ColophonMarkdown } from './components/ColophonMarkdown';
import type { ColophonPluginList } from './pipeline';
import { ColophonPipelineProvider, mergePipelines } from './pipeline';
import type { SanitizeSchema } from './sanitizeSchema';
import { colophonSanitizeSchema } from './sanitizeSchema';

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

const admonitionSchema: SanitizeSchema = {
  ...colophonSanitizeSchema,
  tagNames: [...(colophonSanitizeSchema.tagNames ?? []), 'aside'],
  attributes: {
    ...colophonSanitizeSchema.attributes,
    aside: [['className', 'admonition']],
  },
};

/**
 * The props alone would have been unreachable for anyone using the shipped
 * frontend plugin: `DocsBrowser` owns the `ColophonMarkdown` call site and
 * passes no pipeline props. Context is the same escape the component registry
 * already provides, so these tests are about the renderer picking it up
 * without anyone threading a prop.
 */
describe('ColophonPipelineProvider', () => {
  it('reaches a renderer that was given no pipeline props', async () => {
    const { container } = await renderInTestApp(
      <ColophonPipelineProvider
        remarkPlugins={[remarkAdmonition]}
        sanitizeSchema={admonitionSchema}
      >
        <ColophonMarkdown content={'> Rotate the key first.\n'} />
      </ColophonPipelineProvider>,
    );

    expect(container.querySelector('aside')).toHaveClass('admonition');
  });

  it('nests, so an inner provider adds to the outer rather than replacing it', async () => {
    const remarkMarkLists = () => (tree: unknown) => {
      const visit = (node: unknown): void => {
        if (typeof node !== 'object' || node === null) {
          return;
        }
        const element = node as {
          type?: string;
          data?: Record<string, unknown>;
          children?: unknown[];
        };
        if (element.type === 'list') {
          element.data = { hName: 'nav' };
        }
        for (const child of element.children ?? []) {
          visit(child);
        }
      };
      visit(tree);
    };
    const bothSchema: SanitizeSchema = {
      ...admonitionSchema,
      tagNames: [...(admonitionSchema.tagNames ?? []), 'nav'],
    };

    const { container } = await renderInTestApp(
      <ColophonPipelineProvider remarkPlugins={[remarkAdmonition]}>
        <ColophonPipelineProvider
          remarkPlugins={[remarkMarkLists]}
          sanitizeSchema={bothSchema}
        >
          <ColophonMarkdown content={'> quoted\n\n- item\n'} />
        </ColophonPipelineProvider>
      </ColophonPipelineProvider>,
    );

    expect(container.querySelector('aside')).toBeInTheDocument();
    expect(container.querySelector('nav')).toBeInTheDocument();
  });

  it('adds a prop after whatever the provider supplied', () => {
    const a = () => {};
    const b = () => {};
    const merged = mergePipelines(
      { remarkPlugins: [a] },
      { remarkPlugins: [b] },
    );

    expect(merged.remarkPlugins).toEqual([a, b]);
  });

  it('lets an inner schema replace an outer one', () => {
    const outer = { tagNames: ['p'] } as SanitizeSchema;
    const inner = { tagNames: ['div'] } as SanitizeSchema;

    expect(mergePipelines({ sanitizeSchema: outer }, {}).sanitizeSchema).toBe(
      outer,
    );
    expect(
      mergePipelines({ sanitizeSchema: outer }, { sanitizeSchema: inner })
        .sanitizeSchema,
    ).toBe(inner);
  });
});

/**
 * `unified.use()` matches by attacher IDENTITY, so a caller naming a plugin
 * the pipeline already runs does NOT append a second pass — it rewrites the
 * existing entry in place, merging options in and leaving it where it was.
 * Reproduced before the guard existed:
 *
 *   rehypePlugins={[[rehypeSlug, { prefix: 'user-content-' }]]}
 *   → <h2 id="user-content-some-heading">, manifest anchor "some-heading",
 *     every table-of-contents link on the page dead, no error, no warning.
 *
 *   rehypePlugins={[[rehypeSanitize, { tagNames: ['aside'] }]]}
 *   → an <aside> rendered without `sanitizeSchema` ever being touched: a
 *     second, undocumented route into the security boundary.
 */
describe('reserved rehype plugins', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Render errors are noisy and expected in this block.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when a caller passes options to rehype-slug', async () => {
    await expect(
      renderInTestApp(
        <ColophonMarkdown
          content={'## Some heading\n'}
          rehypePlugins={[[rehypeSlug, { prefix: 'user-content-' }]]}
        />,
      ),
    ).rejects.toThrow(/rehype-slug/);
  });

  it('names the consequence rather than just refusing', async () => {
    const attempt = renderInTestApp(
      <ColophonMarkdown
        content={'## Some heading\n'}
        rehypePlugins={[[rehypeSlug, { prefix: 'x-' }]]}
      />,
    );

    await expect(attempt).rejects.toThrow(/table-of-contents/);
    await expect(attempt).rejects.toThrow(/identity/);
  });

  it('throws when a caller passes options to rehype-sanitize', async () => {
    await expect(
      renderInTestApp(
        <ColophonMarkdown
          content={'> quoted\n'}
          rehypePlugins={[[rehypeSanitize, { tagNames: ['aside'] }]]}
        />,
      ),
    ).rejects.toThrow(/sanitizeSchema/);
  });

  it('throws for a reserved plugin nested inside a plugin list', async () => {
    // unified's `use` recurses into a nested array even though the published
    // type does not describe one, so the guard has to as well.
    const nested = [[[rehypeSlug, { prefix: 'x-' }]]] as ColophonPluginList;

    await expect(
      renderInTestApp(
        <ColophonMarkdown
          content={'## Some heading\n'}
          rehypePlugins={nested}
        />,
      ),
    ).rejects.toThrow(/rehype-slug/);
  });

  it('throws through a provider too, not only through props', async () => {
    await expect(
      renderInTestApp(
        <ColophonPipelineProvider
          rehypePlugins={[[rehypeSlug, { prefix: 'x-' }]]}
        >
          <ColophonMarkdown content={'## Some heading\n'} />
        </ColophonPipelineProvider>,
      ),
    ).rejects.toThrow(/rehype-slug/);
  });

  it('only warns for a bare reserved plugin, which is genuinely inert', async () => {
    // unified skips the merge when there are no parameters, so this changes
    // nothing — and it is half of the rehype-autolink-headings recipe, which
    // must keep working.
    await renderInTestApp(
      <ColophonMarkdown
        content={'## Rotating credentials\n'}
        rehypePlugins={[rehypeSlug]}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Rotating credentials' }),
    ).toHaveAttribute('id', 'rotating-credentials');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('rehype-slug');
  });

  it('leaves an unrelated plugin alone', async () => {
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

    await renderInTestApp(
      <ColophonMarkdown
        content={'A *word*.\n'}
        rehypePlugins={[rehypeMarkEmphasis]}
      />,
    );

    expect(screen.getByText('word')).toHaveClass('marked');
    expect(warn).not.toHaveBeenCalled();
  });
});
