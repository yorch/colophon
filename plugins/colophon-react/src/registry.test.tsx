import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { defaultColophonComponents } from './defaultComponents';
import {
  ColophonComponentsProvider,
  mergeComponents,
  useColophonComponents,
} from './registry';
import type {
  CodeBlockProps,
  CodeProps,
  ColophonComponents,
  LinkProps,
} from './types';

const CustomCode = ({ value }: CodeProps) => <span>{value}</span>;
const CustomLink = ({ children }: LinkProps) => <span>{children}</span>;
const Plant = ({ value }: CodeBlockProps) => <div>{value}</div>;

describe('mergeComponents', () => {
  it('keeps defaults for anything not overridden', () => {
    const merged = mergeComponents(defaultColophonComponents, {
      code: CustomCode,
    });

    expect(merged.code).toBe(CustomCode);
    expect(merged.link).toBe(defaultColophonComponents.link);
  });

  it('merges language handlers instead of replacing the map', () => {
    const merged = mergeComponents(defaultColophonComponents, {
      codeLanguages: { plantuml: Plant },
    });

    expect(merged.codeLanguages.plantuml).toBe(Plant);
    expect(merged.codeLanguages.mermaid).toBe(
      defaultColophonComponents.codeLanguages.mermaid,
    );
  });

  it('ignores explicitly undefined overrides', () => {
    const merged = mergeComponents(defaultColophonComponents, {
      code: undefined,
    });

    expect(merged.code).toBe(defaultColophonComponents.code);
  });

  it('keeps the block-level slots apart from the inline ones', () => {
    const Block = () => null;
    const merged = mergeComponents(defaultColophonComponents, {
      blockquote: Block,
      listItem: Block,
      tableCell: Block,
    });

    expect(merged.blockquote).toBe(Block);
    expect(merged.listItem).toBe(Block);
    expect(merged.tableCell).toBe(Block);
    expect(merged.paragraph).toBe(defaultColophonComponents.paragraph);
  });

  /**
   * TypeScript rejects an unknown slot, and adopters cast past it — through
   * `as ColophonComponents`, through a helper that widens the type. The
   * override then lands in an object nothing reads, and the page renders
   * exactly as it did before, so the search starts in the component.
   */
  describe('unknown slots', () => {
    const cast = (components: Record<string, unknown>) =>
      components as ColophonComponents;

    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('warns, naming the key and the slots that do exist', () => {
      const Custom = () => null;
      mergeComponents(defaultColophonComponents, cast({ blockqoute: Custom }));

      expect(warn).toHaveBeenCalledTimes(1);
      const message = warn.mock.calls[0][0] as string;
      expect(message).toContain('blockqoute');
      expect(message).toContain('blockquote');
    });

    it('warns once per key, not once per render', () => {
      // Providers merge inside a `useMemo`, so an adopter passing an inline
      // object literal re-merges on every render of the tree above them.
      const Custom = () => null;
      const overrides = cast({ tableFooter: Custom });
      mergeComponents(defaultColophonComponents, overrides);
      mergeComponents(defaultColophonComponents, overrides);

      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('drops the key rather than carrying it along', () => {
      const Custom = () => null;
      const merged = mergeComponents(
        defaultColophonComponents,
        cast({ footnote: Custom }),
      );

      expect(merged).not.toHaveProperty('footnote');
    });

    it('says nothing about a slot that exists', () => {
      mergeComponents(defaultColophonComponents, { code: CustomCode });

      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe('ColophonComponentsProvider', () => {
  function Probe() {
    const components = useColophonComponents();
    return (
      <ul>
        <li data-testid="code">{components.code.name}</li>
        <li data-testid="link">{components.link.name}</li>
        <li data-testid="languages">
          {Object.keys(components.codeLanguages).sort().join(',')}
        </li>
      </ul>
    );
  }

  it('falls back to the defaults with no provider', async () => {
    await renderInTestApp(<Probe />);

    expect(screen.getByTestId('code')).toHaveTextContent('DefaultCode');
    expect(screen.getByTestId('languages')).toHaveTextContent('mermaid');
  });

  it('nests, so an inner provider extends rather than replaces the outer', async () => {
    await renderInTestApp(
      <ColophonComponentsProvider components={{ code: CustomCode }}>
        <ColophonComponentsProvider components={{ link: CustomLink }}>
          <Probe />
        </ColophonComponentsProvider>
      </ColophonComponentsProvider>,
    );

    expect(screen.getByTestId('code')).toHaveTextContent('CustomCode');
    expect(screen.getByTestId('link')).toHaveTextContent('CustomLink');
  });

  it('accumulates language handlers across nested providers', async () => {
    await renderInTestApp(
      <ColophonComponentsProvider
        components={{ codeLanguages: { plantuml: Plant } }}
      >
        <ColophonComponentsProvider
          components={{ codeLanguages: { vega: Plant } }}
        >
          <Probe />
        </ColophonComponentsProvider>
      </ColophonComponentsProvider>,
    );

    expect(screen.getByTestId('languages')).toHaveTextContent(
      'mermaid,plantuml,vega',
    );
  });
});
