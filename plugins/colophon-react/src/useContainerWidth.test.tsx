import { render } from '@testing-library/react';
import { useContainerWidth } from './useContainerWidth';

/**
 * jsdom has no layout engine and no ResizeObserver, so these check the WIRING:
 * that the element gets observed at all, and that it gets observed even when
 * it appears on a later render than the first.
 */
describe('useContainerWidth', () => {
  let observed: Element[];
  let disconnected: number;

  beforeEach(() => {
    observed = [];
    disconnected = 0;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {
        disconnected += 1;
      }
      unobserve() {}
    };
  });

  afterEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
  });

  function Probe({ ready }: { ready: boolean }) {
    const { ref } = useContainerWidth();
    // Mirrors the real component, which returns a loading state before the
    // element it wants to measure exists.
    return ready ? (
      <div ref={ref} data-testid="target" />
    ) : (
      <span>loading</span>
    );
  }

  it('observes the element it is attached to', () => {
    const { getByTestId } = render(<Probe ready />);
    expect(observed).toEqual([getByTestId('target')]);
  });

  it('observes an element that appears after the first render', () => {
    // The bug this exists for: with a ref OBJECT, the effect runs once against
    // null while the component is still loading, and never again — the ref's
    // identity is stable, so nothing tells it an element has arrived. The
    // layout then behaves as though it had unlimited room, forever.
    const { rerender, getByTestId } = render(<Probe ready={false} />);
    expect(observed).toEqual([]);

    rerender(<Probe ready />);
    expect(observed).toEqual([getByTestId('target')]);
  });

  it('disconnects when the element goes away', () => {
    const { rerender } = render(<Probe ready />);
    rerender(<Probe ready={false} />);
    expect(disconnected).toBeGreaterThan(0);
  });

  it('reports no width where ResizeObserver is unavailable', () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    let width: number | undefined = 1;
    function Reader() {
      ({ width } = useContainerWidth());
      return null;
    }
    render(<Reader />);
    // Undefined has to mean "not measured", so callers can choose the layout
    // for a wide container rather than flashing a collapsed one.
    expect(width).toBeUndefined();
  });
});
