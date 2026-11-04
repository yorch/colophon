import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import {
  ColophonSearchResultItem,
  renderHighlighted,
} from './ColophonSearchResultItem';

describe('renderHighlighted', () => {
  const html = (nodes: ReturnType<typeof renderHighlighted>) =>
    render(<div data-testid="out">{nodes}</div>).getByTestId('out').innerHTML;

  it('marks text between the engine tags', () => {
    expect(html(renderHighlighted('a <b>store</b> z', '<b>', '</b>'))).toBe(
      'a <mark>store</mark> z',
    );
  });

  it('drops stray UUID-led tags the engine left behind', () => {
    const out = html(
      renderHighlighted(
        'x <284a1ec5-0000-4000-8000-000000000000>store</284a1ec5-0000-4000-8000-000000000000> y',
        '<b>',
        '</b>',
      ),
    );
    expect(out).toBe('x store y');
  });

  it('does not let an unclosed opener swallow the snippet or inject markup', () => {
    const out = html(
      renderHighlighted(
        'one <b>two <img src=x onerror=alert(1)>',
        '<b>',
        '</b>',
      ),
    );
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<mark>');
    expect(out).toContain('one two');
  });

  it('ignores a closer without an opener', () => {
    expect(html(renderHighlighted('a</b> b', '<b>', '</b>'))).toBe('a b');
  });

  it('collapses whitespace so tables and fences do not stack up lines', () => {
    expect(html(renderHighlighted('a\n\n  b\t c', undefined, undefined))).toBe(
      'a b c',
    );
  });
});

describe('ColophonSearchResultItem', () => {
  it('leads the trail with the repository and clamps the snippet', async () => {
    // Declared apart from the JSX: the collator's extra fields are not on
    // SearchDocument, and an inline literal would be rejected as excess.
    const chunk = {
      title: 'Chunking',
      text: 'long text',
      location: '/colophon/github.com/o/r?page=a',
      bundleId: 'github.com/o/r',
      breadcrumb: ['Architecture', 'Chunking'],
    };
    await renderInTestApp(<ColophonSearchResultItem result={chunk} />);
    expect(
      screen.getByText('github.com/o/r › Architecture'),
    ).toBeInTheDocument();
    expect(screen.getByText('long text')).toHaveStyle({
      overflow: 'hidden',
    });
  });

  it('highlights through the engine tags and never prints them', async () => {
    await renderInTestApp(
      <ColophonSearchResultItem
        result={{ title: 'T', text: 'plain', location: '/x' }}
        highlight={{
          preTag: '<em>',
          postTag: '</em>',
          fields: { text: 'some <em>store</em> here' },
        }}
      />,
    );
    expect(screen.getByText('store').tagName).toBe('MARK');
    expect(screen.queryByText(/<em>/)).toBeNull();
  });
});
