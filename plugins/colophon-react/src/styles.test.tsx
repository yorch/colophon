import { render } from '@testing-library/react';
import { ColophonNav } from './components/ColophonNav';
import { ColophonToc } from './components/ColophonToc';
import { COLOPHON_STYLE_ELEMENT_ID, ensureColophonStyles } from './styles';

const styleTag = () => document.getElementById(COLOPHON_STYLE_ELEMENT_ID);

/**
 * The stylesheet used to be injected by the markdown renderer alone, which
 * was invisible for as long as its rules only styled markdown. It now carries
 * layout, list rows and the navigation's active state — things that appear on
 * pages where no markdown is rendered at all — and those came out unstyled.
 *
 * So the invariant is: any component that emits a `colophon-` class ensures
 * the stylesheet itself. These tests render each one ALONE, which is the only
 * arrangement that can catch a component relying on a sibling to do it.
 */
describe('stylesheet injection', () => {
  afterEach(() => {
    styleTag()?.remove();
  });

  it('is added by the navigation on its own', () => {
    expect(styleTag()).toBeNull();
    render(
      <ColophonNav
        nodes={[{ title: 'A', slug: 'a' }]}
        hrefForSlug={s => `/${s}`}
      />,
    );
    expect(styleTag()).not.toBeNull();
  });

  it('is added by the table of contents on its own', () => {
    expect(styleTag()).toBeNull();
    render(<ColophonToc headings={[{ depth: 2, text: 'A', anchor: 'a' }]} />);
    expect(styleTag()).not.toBeNull();
  });

  it('is added exactly once however many components ask', () => {
    // A search results page renders one markdown block per hit, so this runs
    // as many times as there are results.
    ensureColophonStyles();
    ensureColophonStyles();
    render(
      <ColophonNav
        nodes={[{ title: 'A', slug: 'a' }]}
        hrefForSlug={s => `/${s}`}
      />,
    );
    expect(
      document.querySelectorAll(`#${COLOPHON_STYLE_ELEMENT_ID}`),
    ).toHaveLength(1);
  });

  it('carries the rules those components depend on', () => {
    // Cheap guard against a class being renamed on one side only.
    ensureColophonStyles();
    const css = styleTag()?.textContent ?? '';
    for (const rule of [
      '.colophon-layout',
      '.colophon-nav-disclosure',
      '.colophon-bundle-row',
      '.colophon-skeleton',
      "a[aria-current='page']",
    ]) {
      expect(css).toContain(rule);
    }
  });
});
