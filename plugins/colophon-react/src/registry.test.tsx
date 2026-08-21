import { renderInTestApp } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { defaultColophonComponents } from './defaultComponents';
import {
  ColophonComponentsProvider,
  mergeComponents,
  useColophonComponents,
} from './registry';
import type { CodeBlockProps, CodeProps, LinkProps } from './types';

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
