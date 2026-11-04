import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import type { Heading } from '@brnby/colophon-common';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ColophonMarkdown } from './components/ColophonMarkdown';
import { ColophonNav } from './components/ColophonNav';
import { ColophonPageHeader } from './components/ColophonPageHeader';
import { ColophonSkeleton } from './components/ColophonSkeleton';
import { ColophonToc } from './components/ColophonToc';
import { remarkCallouts } from './remarkCallouts';

/**
 * Wiring tests. jsdom has no layout, no scrolling and no cascade, so none of
 * this proves how anything LOOKS or that a scroll lands — only that the right
 * elements, attributes and handlers exist for a browser to act on.
 */

const md = (content: string, pageTitle?: string) =>
  render(<ColophonMarkdown content={content} pageTitle={pageTitle} />);

describe('callouts', () => {
  it.each([
    ['NOTE', 'Note'],
    ['TIP', 'Tip'],
    ['IMPORTANT', 'Important'],
    ['WARNING', 'Warning'],
    ['CAUTION', 'Caution'],
  ])('renders [!%s] as a labelled note aside', (marker, label) => {
    const { container } = md(`> [!${marker}]\n> Mind the gap.\n`);

    const aside = container.querySelector('aside');
    expect(aside).toHaveAttribute('role', 'note');
    expect(aside).toHaveClass(
      'colophon-callout',
      `colophon-callout-${marker.toLowerCase()}`,
    );
    expect(aside?.querySelector('.colophon-callout-title')).toHaveTextContent(
      label,
    );
    expect(aside).toHaveTextContent('Mind the gap.');
    // The literal marker must not survive into the prose.
    expect(container).not.toHaveTextContent('[!');
    expect(container.querySelector('blockquote')).toBeNull();
  });

  it('accepts the marker case-insensitively and with text on the same line', () => {
    const { container } = md('> [!note] Same line.\n');
    expect(container.querySelector('aside')).toHaveTextContent('Same line.');
  });

  it('keeps multiple paragraphs, lists and code inside the callout', () => {
    const { container } = md(
      '> [!TIP]\n> First.\n>\n> - one\n> - two\n>\n> `code`\n',
    );
    const aside = container.querySelector('aside');
    expect(aside?.querySelectorAll('li')).toHaveLength(2);
    expect(aside?.querySelector('code')).toHaveTextContent('code');
  });

  it('leaves an ordinary blockquote alone', () => {
    const { container } = md('> Just a quote.\n');
    expect(container.querySelector('blockquote')).not.toBeNull();
    expect(container.querySelector('aside')).toBeNull();
  });

  it('does not treat an unknown marker or a mid-quote marker as a callout', () => {
    const { container } = md('> [!DANGER]\n> x\n\n> Intro\n> [!NOTE]\n');
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelectorAll('blockquote')).toHaveLength(2);
  });

  it('is a pure mdast transform that ignores trees without blockquotes', () => {
    const tree = { type: 'root', children: [{ type: 'paragraph' }] };
    expect(() => remarkCallouts()(tree)).not.toThrow();
  });

  describe('hostile input', () => {
    const hostile = [
      '> [!NOTE]',
      '> <script>window.pwned = 1</script>',
      '> <img src=x onerror="window.pwned = 2">',
      '> [click](javascript:window.pwned=3)',
      '',
      '<aside class="colophon-callout evil" role="alert" onclick="window.pwned=4">raw</aside>',
      '',
      '<div class="colophon-callout-title" onmouseover="window.pwned=5">raw title</div>',
    ].join('\n');

    it('keeps scripts, event handlers and javascript: urls out of the DOM', () => {
      const { container } = md(hostile);

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      for (const element of container.querySelectorAll('*')) {
        for (const attribute of element.getAttributeNames()) {
          expect(attribute).not.toMatch(/^on/i);
        }
      }
      for (const link of container.querySelectorAll('a')) {
        expect(link.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
      }
      expect((window as { pwned?: number }).pwned).toBeUndefined();
    });

    it('never lets page content pick the aside class or role', () => {
      const { container } = md(hostile);

      // The one aside is the callout the remark step made; the raw `aside`
      // and `div` in the page are dropped as raw HTML before they get here.
      const asides = container.querySelectorAll('aside');
      expect(asides).toHaveLength(1);
      expect(asides[0]).toHaveAttribute('role', 'note');
      expect(container.querySelector('.evil')).toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container).not.toHaveTextContent('raw title');
    });
  });
});

describe('headings', () => {
  it('drops a leading body h1 that repeats the page title', () => {
    const { container } = md('# Payments API\n\nBody.\n', 'payments  API');
    expect(container.querySelector('h1')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    // The id survives so a link to it still lands somewhere.
    expect(container.querySelector('#payments-api')).not.toBeNull();
  });

  it('demotes any other body h1 to h2, so the header owns the only h1', () => {
    const { container } = md('# Something else\n\n## Next\n', 'Payments API');
    expect(container.querySelector('h1')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Something else' }),
    ).toBeInTheDocument();
  });

  it('demotes every body h1 when no page title is given', () => {
    const { container } = md('# Title\n');
    expect(container.querySelector('h1')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('adds a section link beside, not inside, each heading', () => {
    md('## Operations\n');
    const heading = screen.getByRole('heading', { name: 'Operations' });
    const link = screen.getByRole('link', { name: 'Link to this section' });
    expect(link).toHaveAttribute('href', '#operations');
    expect(heading).not.toContainElement(link);
  });

  it('gives the page header a larger heading than any body heading', async () => {
    const { container } = await renderInTestApp(
      <>
        <ColophonPageHeader title="Payments API" />
        <ColophonMarkdown content={'## Operations\n'} />
      </>,
    );
    const h1 = container.querySelector('h1');
    const h2 = container.querySelector('h2');
    expect(h1).toHaveAttribute('data-variant', 'title-large');
    expect(h2).toHaveAttribute('data-variant', 'title-medium');
  });
});

describe('code blocks', () => {
  const fenced = '```ts\nconst a = 1;\n```\n';
  const clipboard = { writeText: jest.fn() };

  beforeEach(() => {
    clipboard.writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
  });

  it('labels the language and copies the source', async () => {
    const { container } = md(fenced);
    expect(
      container.querySelector('.colophon-code-language'),
    ).toHaveTextContent('ts');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy ts code' }));
    });
    expect(clipboard.writeText).toHaveBeenCalledWith('const a = 1;');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Code copied to clipboard',
    );
  });

  it('says so when copying is refused', async () => {
    clipboard.writeText.mockRejectedValue(new Error('denied'));
    md(fenced);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy ts code' }));
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copy failed');
  });

  it('is not a tab stop unless it actually overflows', () => {
    const { container } = md(fenced);
    expect(container.querySelector('pre')).not.toHaveAttribute('tabindex');
  });

  describe('when the content overflows', () => {
    let widths: jest.SpyInstance;
    let client: jest.SpyInstance;

    beforeEach(() => {
      // jsdom reports 0 for every metric, so overflow has to be stubbed.
      widths = jest
        .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
        .mockReturnValue(900);
      client = jest
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockReturnValue(300);
    });

    afterEach(() => {
      widths.mockRestore();
      client.mockRestore();
    });

    it('becomes a focusable, named region with an end fade', () => {
      const { container } = md(fenced);
      const pre = container.querySelector('pre');
      expect(pre).toHaveAttribute('tabindex', '0');
      expect(pre).toHaveAttribute('role', 'region');
      expect(pre).toHaveAttribute('aria-label', 'ts code');
      expect(pre).toHaveAttribute('data-fade-end', 'true');
      expect(pre).not.toHaveAttribute('data-fade-start');
    });

    it('fades the start edge once scrolled', () => {
      const { container } = md(fenced);
      const pre = container.querySelector('pre') as HTMLElement;
      pre.scrollLeft = 100;
      fireEvent.scroll(pre);
      expect(pre).toHaveAttribute('data-fade-start', 'true');
      expect(pre).toHaveAttribute('data-fade-end', 'true');
      pre.scrollLeft = 600;
      fireEvent.scroll(pre);
      expect(pre).not.toHaveAttribute('data-fade-end');
    });

    it('does the same for a wide table', () => {
      const { container } = md('| a | b |\n| - | - |\n| 1 | 2 |\n');
      const region = container.querySelector('.colophon-markdown-table-scroll');
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region).toHaveAttribute('role', 'region');
      expect(region).toHaveAttribute('aria-label', 'Table');
    });
  });
});

describe('task lists', () => {
  it('renders nested items under a task item inside it', () => {
    const { container } = md('- [ ] one\n  - nested\n- [x] two\n');
    const item = container.querySelector('li.task-list-item');
    expect(item?.querySelector('ul')).not.toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      2,
    );
  });
});

describe('table of contents', () => {
  const headings: Heading[] = [
    { depth: 2, text: 'First', anchor: 'first' },
    { depth: 2, text: 'Second', anchor: 'second' },
  ];

  type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
  let callbacks: Callback[];
  let observed: Element[];
  const original = window.IntersectionObserver;

  beforeEach(() => {
    callbacks = [];
    observed = [];
    window.IntersectionObserver = class {
      constructor(callback: Callback) {
        callbacks.push(callback);
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    document.body.insertAdjacentHTML(
      'beforeend',
      '<h2 id="first">First</h2><h2 id="second">Second</h2>',
    );
  });

  afterEach(() => {
    window.IntersectionObserver = original;
    document.getElementById('first')?.remove();
    document.getElementById('second')?.remove();
  });

  it('marks the heading in view with aria-current="location"', async () => {
    await renderInTestApp(<ColophonToc headings={headings} />);
    expect(observed.map(e => e.id)).toEqual(['first', 'second']);

    act(() => {
      callbacks[0]([
        {
          target: document.getElementById('second') as Element,
          isIntersecting: true,
        },
      ]);
    });
    expect(screen.getByRole('link', { name: 'Second' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('link', { name: 'First' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps the last heading marked when none is in the band', async () => {
    await renderInTestApp(<ColophonToc headings={headings} />);
    const first = document.getElementById('first') as Element;
    act(() => callbacks[0]([{ target: first, isIntersecting: true }]));
    act(() => callbacks[0]([{ target: first, isIntersecting: false }]));
    expect(screen.getByRole('link', { name: 'First' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('works without IntersectionObserver, marking nothing', async () => {
    // @ts-expect-error simulating jsdom / an old browser
    window.IntersectionObserver = undefined;
    await renderInTestApp(<ColophonToc headings={headings} />);
    expect(screen.getByRole('link', { name: 'First' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('renders the same links behind a disclosure for narrow containers', async () => {
    const { container } = await renderInTestApp(
      <ColophonToc headings={headings} variant="disclosure" />,
    );
    expect(container.querySelector('details > summary')).toHaveTextContent(
      'On this page',
    );
    expect(container.querySelector('nav')).toHaveClass(
      'colophon-toc-disclosure',
    );
    expect(screen.getAllByRole('link', { hidden: true })).toHaveLength(2);
  });
});

describe('navigation', () => {
  it('gives group headers the class that aligns them with the links', async () => {
    const { container } = await renderInTestApp(
      <ColophonNav
        nodes={[{ title: 'Guides', children: [{ title: 'A', slug: 'a' }] }]}
        hrefForSlug={s => `/${s}`}
      />,
    );
    expect(container.querySelector('.colophon-nav-group')).toHaveTextContent(
      'Guides',
    );
  });
});

describe('page header', () => {
  it('banners a deprecated page and styles its badge by status', async () => {
    const { container } = await renderInTestApp(
      <ColophonPageHeader title="Legacy" status="deprecated" />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/deprecated/i);
    expect(
      container.querySelector('[data-status="deprecated"]'),
    ).toHaveTextContent('Deprecated');
  });

  it('marks a draft without a warning banner', async () => {
    const { container } = await renderInTestApp(
      <ColophonPageHeader title="WIP" status="draft" />,
    );
    expect(container.querySelector('[data-status="draft"]')).not.toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('labels the date as the revision date', async () => {
    await renderInTestApp(
      <ColophonPageHeader title="x" updatedAt="2026-03-04T09:15:00Z" />,
    );
    expect(screen.getByText(/Revision updated/)).toBeInTheDocument();
  });

  it('describes new-tab links without renaming them', async () => {
    await renderInTestApp(
      <ColophonPageHeader
        title="x"
        editUrl="https://example.com/edit"
        sourceUrl="https://example.com/blob"
      />,
    );
    const edit = screen.getByRole('link', { name: 'Edit this page' });
    expect(edit).toHaveAccessibleDescription('Opens in a new tab');
    expect(
      screen.getByRole('link', { name: 'View source' }),
    ).toHaveAccessibleDescription('Opens in a new tab');
  });
});

describe('skeleton', () => {
  it.each(['page', 'nav', 'layout'] as const)(
    'announces the %s variant as a busy status region',
    variant => {
      render(<ColophonSkeleton variant={variant} label="Loading things" />);
      const region = screen.getByRole('status');
      expect(region).toHaveAttribute('aria-busy', 'true');
      expect(region).toHaveTextContent('Loading things');
    },
  );
});
