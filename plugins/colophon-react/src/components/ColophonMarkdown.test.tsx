import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { ColophonComponentsProvider } from '../registry';
import type { CodeBlockProps, CodeProps, LinkProps } from '../types';
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
});
