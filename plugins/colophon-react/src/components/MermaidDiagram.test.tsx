import type { AppThemeApi } from '@backstage/core-plugin-api';
import { appThemeApiRef } from '@backstage/core-plugin-api';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MermaidDiagram } from './MermaidDiagram';

const mockInitialize = jest.fn();
const mockRender = jest.fn();
const mockParse = jest.fn();
const mockLoads = { count: 0 };

jest.mock('mermaid', () => {
  // Incremented when the module is first required, which is what proves the
  // component reached it through a dynamic import rather than a static one.
  mockLoads.count += 1;
  return {
    __esModule: true,
    default: {
      initialize: mockInitialize,
      render: mockRender,
      parse: mockParse,
    },
  };
});

const DIAGRAM = 'graph TD;\n  A-->B;';

/** A minimal app theme api whose selection can be driven from a test. */
function fakeThemeApi(initialThemeId: string) {
  let themeId = initialThemeId;
  const observers = new Set<(value: string | undefined) => void>();
  const observable = {
    subscribe(next: unknown) {
      const notify =
        typeof next === 'function'
          ? (next as (value: string | undefined) => void)
          : (next as { next: (value: string | undefined) => void }).next;
      observers.add(notify);
      return { unsubscribe: () => observers.delete(notify), closed: false };
    },
    [Symbol.for('observable')]() {
      return observable;
    },
  };
  return {
    api: {
      getInstalledThemes: () => [
        { id: 'light', title: 'Light', variant: 'light' },
        { id: 'dark', title: 'Dark', variant: 'dark' },
      ],
      getActiveThemeId: () => themeId,
      activeThemeId$: () => observable,
      setActiveThemeId: (next?: string) => {
        themeId = next ?? 'light';
        for (const observer of observers) {
          observer(themeId);
        }
      },
    } as unknown as AppThemeApi,
    select(next: string) {
      themeId = next;
      for (const observer of observers) {
        observer(next);
      }
    },
  };
}

function withTheme(themeApi: AppThemeApi, children: ReactNode) {
  return (
    <TestApiProvider apis={[[appThemeApiRef, themeApi]]}>
      {children}
    </TestApiProvider>
  );
}

describe('MermaidDiagram', () => {
  beforeEach(() => {
    mockInitialize.mockClear();
    mockRender.mockReset();
    mockParse.mockReset();
    mockParse.mockResolvedValue(true);
    mockRender.mockResolvedValue({ svg: '<svg data-testid="svg"></svg>' });
  });

  it('does not pull mermaid into the module graph until it renders', async () => {
    // Importing this test file has already imported MermaidDiagram, and with
    // it `defaultCodeLanguages`. If mermaid were a static import the mock
    // factory would have run by now.
    expect(mockLoads.count).toBe(0);

    const { api } = fakeThemeApi('light');
    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );

    await screen.findByTestId('mermaid-diagram');
    expect(mockLoads.count).toBe(1);
  });

  it('renders the svg mermaid produced', async () => {
    const { api } = fakeThemeApi('light');
    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );

    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.innerHTML).toContain('<svg');
    expect(mockRender).toHaveBeenCalledWith(expect.any(String), DIAGRAM);
  });

  it('falls back to the source when mermaid cannot render it', async () => {
    mockRender.mockRejectedValue(new Error('Parse error on line 2'));
    const { api } = fakeThemeApi('light');

    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );

    const fallback = await screen.findByTestId('mermaid-fallback');
    expect(fallback.querySelector('pre')).toHaveTextContent('graph TD;');
    expect(
      screen.getByText(/This diagram could not be rendered/),
    ).toBeInTheDocument();
    // The parser's own message is a multi-line dump about a grammar the author
    // may never have seen; it must not reach the page.
    expect(screen.queryByText(/Parse error/)).toBeNull();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();
  });

  it('parses before rendering and never renders an invalid diagram', async () => {
    mockParse.mockRejectedValue(new Error('Parse error on line 2'));
    const { api } = fakeThemeApi('light');

    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );

    await screen.findByTestId('mermaid-fallback');
    expect(mockParse).toHaveBeenCalledWith(DIAGRAM);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("turns mermaid's own error rendering off", async () => {
    const { api } = fakeThemeApi('light');
    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );
    await screen.findByTestId('mermaid-diagram');
    expect(mockInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ suppressErrorRendering: true }),
    );
  });

  it('removes the scratch elements mermaid leaks when a render fails', async () => {
    // mermaid appends `#d<id>` to <body> and only removes it on success, so a
    // failed render leaves its error graphic over the page.
    mockRender.mockImplementation(async (id: string) => {
      const leaked = document.createElement('div');
      leaked.id = `d${id}`;
      document.body.appendChild(leaked);
      throw new Error('boom');
    });
    const { api } = fakeThemeApi('light');

    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );

    await screen.findByTestId('mermaid-fallback');
    expect(
      document.querySelector('body > [id^="dcolophon-mermaid"]'),
    ).toBeNull();
  });

  it('gives the rendered diagram an accessible name', async () => {
    const { api } = fakeThemeApi('light');
    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );
    expect(
      await screen.findByRole('img', { name: 'Diagram (graph)' }),
    ).toBeInTheDocument();
  });

  it('initialises mermaid with the theme matching the app', async () => {
    const { api } = fakeThemeApi('dark');
    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );

    await screen.findByTestId('mermaid-diagram');
    expect(mockInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );
  });

  it('re-renders the diagram when the app theme changes', async () => {
    const { api, select } = fakeThemeApi('light');
    await renderInTestApp(
      withTheme(api, <MermaidDiagram language="mermaid" value={DIAGRAM} />),
    );

    await screen.findByTestId('mermaid-diagram');
    expect(mockInitialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'default' }),
    );

    select('dark');

    // Mermaid bakes colours into the svg, so a theme switch has to re-render
    // rather than restyle. The element is already on screen from the light
    // render, so a `findByTestId` here would resolve on its first poll and
    // synchronise nothing — the re-render has to be awaited through the call
    // being asserted on.
    await waitFor(() =>
      expect(mockInitialize).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: 'dark' }),
      ),
    );
  });
});
