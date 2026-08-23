import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { ColophonNav } from './components/ColophonNav';
import { ColophonToc } from './components/ColophonToc';
import {
  COLOPHON_STYLE_ELEMENT_ID,
  colophonMarkdownStyles,
  ensureColophonStyles,
} from './styles';

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

/**
 * Every colour, space and radius in the stylesheet is a Backstage UI token,
 * which is what makes the renderer follow the app's theme instead of carrying
 * a palette of its own. A token that does not exist fails SILENTLY: `var()`
 * with no fallback resolves to nothing, the declaration is dropped, and the
 * page still renders — just without a focus ring, which is how two invented
 * names (`--bui-fg-link`, `--bui-bg-surface-1`) survived here for months.
 *
 * So the names are checked against the stylesheet @backstage/ui actually
 * ships. This also turns an upgrade that renames a token into a test failure
 * rather than a visual regression nobody is looking for.
 */
describe('design tokens', () => {
  const backstageUiCss = () => {
    const manifest = require.resolve('@backstage/ui/package.json');
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    // Read through the exports map rather than hardcoding dist/, so the path
    // is the one the package itself publishes.
    const css = pkg.exports['./css/styles.css'];
    return readFileSync(resolve(dirname(manifest), css), 'utf8');
  };

  it('only names tokens @backstage/ui defines', () => {
    const css = backstageUiCss();
    const referenced = new Set(
      [...colophonMarkdownStyles.matchAll(/var\(\s*(--bui-[a-z0-9-]+)/g)].map(
        match => match[1],
      ),
    );
    expect(referenced.size).toBeGreaterThan(0);
    // Declarations only — `--bui-x:` — so a token that merely appears as a
    // substring of a longer name does not vouch for itself.
    const missing = [...referenced].filter(token => !css.includes(`${token}:`));
    expect(missing).toEqual([]);
  });
});
