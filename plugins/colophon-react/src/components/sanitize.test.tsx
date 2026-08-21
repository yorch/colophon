import { render, screen } from '@testing-library/react';
import { ColophonMarkdown } from './ColophonMarkdown';

/**
 * Page bodies come from arbitrary repositories, so this is a security
 * boundary rather than a formatting concern: anyone who can open a pull
 * request against any indexed repository can choose what this renders.
 */
describe('sanitization', () => {
  it('does not execute or emit a script tag', () => {
    const { container } = render(
      <ColophonMarkdown
        content={'# Title\n\n<script>window.__pwned = 1;</script>\n'}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(
      (window as unknown as Record<string, unknown>).__pwned,
    ).toBeUndefined();
  });

  it('strips inline event handlers', () => {
    const { container } = render(
      <ColophonMarkdown
        content={'<div onclick="window.__pwned = 1">hi</div>\n'}
      />,
    );
    expect(container.innerHTML).not.toContain('onclick');
  });

  it('does not keep a javascript: URL on a link', () => {
    const { container } = render(
      // eslint-disable-next-line no-script-url
      <ColophonMarkdown content={'[click](javascript:window.__pwned=1)\n'} />,
    );
    const href = container.querySelector('a')?.getAttribute('href') ?? '';
    expect(href.toLowerCase()).not.toContain('javascript:');
  });

  it('does not keep a data: URL on a link', () => {
    const { container } = render(
      <ColophonMarkdown
        content={'[x](data:text/html;base64,PHNjcmlwdD4x)\n'}
      />,
    );
    const href = container.querySelector('a')?.getAttribute('href') ?? '';
    expect(href.toLowerCase()).not.toContain('data:text/html');
  });

  it('drops an iframe', () => {
    const { container } = render(
      <ColophonMarkdown
        content={'<iframe src="https://evil.example"></iframe>\n'}
      />,
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('drops an onerror image, the classic markdown xss vector', () => {
    const { container } = render(
      <ColophonMarkdown content={'<img src=x onerror="window.__pwned=1">\n'} />,
    );
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('drops a style tag rather than letting a page restyle the portal', () => {
    const { container } = render(
      <ColophonMarkdown
        content={'<style>body{display:none}</style>\n\ntext\n'}
      />,
    );
    expect(container.querySelector('style')).toBeNull();
  });

  it('still renders the legitimate markdown it is given', () => {
    render(
      <ColophonMarkdown
        content={'# Heading\n\nSome **bold** text and `code`.\n'}
      />,
    );
    // getByText throws when absent, so finding them is the assertion.
    expect(screen.getByText('Heading').tagName).toBe('H1');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });
});
