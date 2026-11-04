import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { ColophonMarkdown } from './components/ColophonMarkdown';
import { ColophonNav } from './components/ColophonNav';
import { ColophonPageHeader } from './components/ColophonPageHeader';
import { ColophonSkeleton } from './components/ColophonSkeleton';
import { ColophonToc } from './components/ColophonToc';
import { MermaidDiagram } from './components/MermaidDiagram';
import { defaultColophonComponents } from './defaultComponents';
import {
  COLOPHON_STYLE_ELEMENT_ID,
  COLOPHON_STYLE_LAYER,
  colophonMarkdownStyles,
  ensureColophonStyles,
  NAV_BREAKPOINT_REM,
  TOC_BREAKPOINT_REM,
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

  it('is added by the toc disclosure on its own', () => {
    expect(styleTag()).toBeNull();
    render(
      <ColophonToc
        variant="disclosure"
        headings={[{ depth: 2, text: 'A', anchor: 'a' }]}
      />,
    );
    expect(styleTag()).not.toBeNull();
  });

  it('is added by the page header on its own', () => {
    expect(styleTag()).toBeNull();
    render(<ColophonPageHeader title="A" />);
    expect(styleTag()).not.toBeNull();
  });

  it.each(['page', 'nav', 'layout'] as const)(
    'is added by the %s skeleton on its own',
    variant => {
      expect(styleTag()).toBeNull();
      render(<ColophonSkeleton variant={variant} />);
      expect(styleTag()).not.toBeNull();
    },
  );

  it('is added by the markdown renderer on its own', () => {
    expect(styleTag()).toBeNull();
    render(<ColophonMarkdown content="text" />);
    expect(styleTag()).not.toBeNull();
  });

  it('is added by the mermaid component on its own', () => {
    expect(styleTag()).toBeNull();
    render(<MermaidDiagram language="mermaid" value="graph TD;" />);
    expect(styleTag()).not.toBeNull();
  });

  // The default markdown components are exported and usable by an override
  // that wraps one, so each that emits a `colophon-` class has to ensure the
  // sheet without the renderer around it.
  describe.each([
    [
      'codeBlock',
      () => <defaultColophonComponents.codeBlock language="ts" value="a" />,
    ],
    ['code', () => <defaultColophonComponents.code value="a" />],
    [
      'heading',
      () => (
        <defaultColophonComponents.heading depth={2} id="a">
          A
        </defaultColophonComponents.heading>
      ),
    ],
    [
      'table',
      () => (
        <defaultColophonComponents.table>
          {null}
        </defaultColophonComponents.table>
      ),
    ],
    ['image', () => <defaultColophonComponents.image src="a.png" alt="a" />],
    [
      'link (in-page)',
      () => (
        <defaultColophonComponents.link href="#a">
          a
        </defaultColophonComponents.link>
      ),
    ],
  ])('default %s component', (_name, element) => {
    it('adds the stylesheet on its own', () => {
      expect(styleTag()).toBeNull();
      render(element());
      expect(styleTag()).not.toBeNull();
    });
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

  /**
   * The cascade is not implemented in jsdom, so this can only assert the
   * text. That an unlayered app rule actually beats a layered Colophon one
   * has to be seen in a browser — the point of the layer is a cascade
   * outcome, and there is no cascade here.
   */
  it('emits every rule inside the colophon layer', () => {
    ensureColophonStyles();
    const css = styleTag()?.textContent ?? '';

    expect(css.trimStart().startsWith(`@layer ${COLOPHON_STYLE_LAYER} {`)).toBe(
      true,
    );
    // Braces balance, so the layer wraps the whole sheet rather than closing
    // early and leaving the rest unlayered — which would look identical here
    // and behave differently in a browser.
    const opened = (css.match(/{/g) ?? []).length;
    const closed = (css.match(/}/g) ?? []).length;
    expect(opened).toBe(closed);
    // The container queries and the reduced-motion rule live inside it. A
    // layer scopes the cascade, not matching, so nesting changes nothing.
    expect(css).toContain('@container (min-width: 48rem)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
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
      '.colophon-skip-link',
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
/**
 * String checks on the stylesheet text. jsdom has no cascade, no container and
 * no :focus-visible, so these only pin the SOURCE of a decision a browser has
 * to honour; that the result looks right is a real-browser question.
 */
describe('stylesheet source', () => {
  const css = () => {
    ensureColophonStyles();
    return styleTag()?.textContent ?? '';
  };

  afterEach(() => {
    styleTag()?.remove();
  });

  it('gives every interactive element a focus-visible outline', () => {
    const text = css();
    for (const selector of [
      '.colophon-nav-list a:focus-visible',
      '.colophon-toc-link:focus-visible',
      '.colophon-nav-disclosure > summary:focus-visible',
      '.colophon-markdown a:focus-visible',
      '.colophon-code-copy:focus-visible',
      '.colophon-heading-anchor:focus-visible',
      '.colophon-scroll:focus-visible',
      '.colophon-channel-picker',
    ]) {
      expect(text).toContain(selector);
    }
  });

  it('never matches the same width on both sides of a breakpoint', () => {
    // min-width and max-width are both inclusive, so a pair at one value both
    // match exactly there. The collapsed side is a negated min-width instead.
    const text = css();
    expect(text).not.toMatch(/@container \(max-width/);
    expect(text).toContain(
      `@container not (min-width: ${NAV_BREAKPOINT_REM}rem)`,
    );
    expect(text).toContain(`@container (min-width: ${TOC_BREAKPOINT_REM}rem)`);
  });

  it('builds every container condition from the exported breakpoints', () => {
    // The docs browser converts NAV_BREAKPOINT_REM to px for the Pages
    // disclosure. If the sheet carried a literal of its own the two could
    // drift again (they were 48rem and 56rem).
    const conditions = [
      ...css().matchAll(/@container (?:not )?\(min-width: ([\d.]+)rem\)/g),
    ].map(m => Number(m[1]));
    expect(conditions.length).toBeGreaterThan(0);
    for (const rem of conditions) {
      expect([NAV_BREAKPOINT_REM, TOC_BREAKPOINT_REM]).toContain(rem);
    }
  });

  it('draws nav and toc focus rings inside the box, where a scroll container cannot clip them', () => {
    expect(css()).toMatch(
      /\.colophon-nav-list a:focus-visible,\s*\.colophon-toc-link:focus-visible \{ outline-offset: -2px; \}/,
    );
  });

  it('has no wrapper focus ring stacked on the version picker', () => {
    expect(css()).not.toContain('.colophon-channel-picker:focus-within');
    expect(css()).not.toContain('.colophon-channel-picker select');
    // The Select's own ring is still declared.
    expect(css()).toContain(
      ".colophon-channel-picker :is(button, [role='combobox']):focus-visible",
    );
  });

  it('marks the active toc and nav row with a logical border, not a physical shadow', () => {
    const text = css();
    expect(text).not.toMatch(/inset 2px 0 0/);
    expect(text).toMatch(
      /\.colophon-toc-link\[aria-current='location'\] \{[^}]*border-inline-start-color/,
    );
    // The active state must not change the box: no padding in that rule.
    expect(text).not.toMatch(
      /\.colophon-toc-link\[aria-current='location'\] \{[^}]*padding/,
    );
  });

  it("gives IMPORTANT its own colours rather than reusing NOTE's", () => {
    const rule = (kind: string) =>
      new RegExp(`\\.colophon-callout-${kind} \\{([^}]*)\\}`).exec(css())?.[1];
    expect(rule('important')).toBeDefined();
    expect(rule('important')).not.toContain('announcement');
  });

  it('colours the code language label with the primary foreground', () => {
    expect(css()).toMatch(
      /\.colophon-code-language \{[^}]*color: var\(--bui-fg-primary\)/,
    );
  });

  it('shares one summary style between the Pages and On this page disclosures', () => {
    expect(css()).toContain(
      '.colophon-toc-disclosure > details > summary::before,\n.colophon-nav-disclosure > summary::before',
    );
  });

  it('keeps @media to device-level concerns only', () => {
    const queries = [...css().matchAll(/^@media ([^{]+)\{/gm)].map(m =>
      m[1].trim(),
    );
    expect([...new Set(queries)].sort()).toEqual([
      '(hover: none)',
      '(pointer: coarse)',
      '(prefers-reduced-motion: reduce)',
    ]);
  });

  it('gives nav and toc rows a touch-sized minimum height', () => {
    const text = css();
    expect(text).toMatch(/min-height: 2rem/);
    expect(text).toMatch(
      /@media \(pointer: coarse\)[\s\S]*min-height: 2\.5rem/,
    );
  });

  it('does not let the bundle link draw a second focus ring', () => {
    expect(css()).toMatch(
      /\.colophon-bundle-row-link:focus-visible \{ outline: none; \}/,
    );
  });
});

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
