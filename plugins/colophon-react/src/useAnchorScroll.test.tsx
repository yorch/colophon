import { renderHook } from '@testing-library/react';
import { useAnchorScroll } from './useAnchorScroll';

/**
 * jsdom has no layout, so these assert the CALLS rather than the resulting
 * offsets — which is the part that was missing. The browser does the scrolling
 * correctly once it is asked; the bug was that nobody asked, and that is
 * exactly what is checkable here.
 */
describe('useAnchorScroll', () => {
  let scrollIntoView: jest.Mock;
  let scrollTo: jest.Mock;

  beforeEach(() => {
    scrollIntoView = jest.fn();
    scrollTo = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    document.body.innerHTML = '<h2 id="two-storage-systems">Two storage</h2>';
  });

  it('scrolls to the heading named by the fragment', () => {
    renderHook(() =>
      useAnchorScroll({ hash: '#two-storage-systems', ready: true }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('waits for the content before scrolling', () => {
    // The whole bug: page bodies arrive after mount, so a fragment resolved
    // at load time finds nothing. Acting while not ready would reintroduce it.
    const { rerender } = renderHook(
      ({ ready }) => useAnchorScroll({ hash: '#two-storage-systems', ready }),
      { initialProps: { ready: false } },
    );
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('accepts a fragment with no leading hash', () => {
    renderHook(() =>
      useAnchorScroll({ hash: 'two-storage-systems', ready: true }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('decodes a percent-encoded fragment', () => {
    document.body.innerHTML = '<h2 id="café">Café</h2>';
    renderHook(() => useAnchorScroll({ hash: '#caf%C3%A9', ready: true }));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('returns to the top when a page is opened without a fragment', () => {
    // Client-side routing keeps the scroll offset across a page change, so
    // without this the reader lands partway into a document they have not
    // seen. Distinct from the fragment case, not a fallback for it.
    renderHook(() => useAnchorScroll({ hash: '', ready: true }));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when the fragment matches no heading', () => {
    // A stale link should leave the reader where they are rather than
    // throwing or jumping somewhere arbitrary.
    renderHook(() =>
      useAnchorScroll({ hash: '#no-such-heading', ready: true }),
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops re-aligning once the reader scrolls', () => {
    renderHook(() =>
      useAnchorScroll({ hash: '#two-storage-systems', ready: true }),
    );
    const initial = scrollIntoView.mock.calls.length;
    window.dispatchEvent(new Event('wheel'));
    // Any later layout change must not yank the page back under them.
    document.body.appendChild(document.createElement('div'));
    expect(scrollIntoView.mock.calls.length).toBe(initial);
  });
});
