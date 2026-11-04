import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

export interface ScrollEdges {
  /** The content is wider than its box, so the box scrolls horizontally. */
  scrollable: boolean;
  /** Content is hidden past the start edge (the reader has scrolled). */
  fadeStart: boolean;
  /** Content is hidden past the end edge. */
  fadeEnd: boolean;
}

const NONE: ScrollEdges = {
  scrollable: false,
  fadeStart: false,
  fadeEnd: false,
};

/**
 * Tells a horizontally scrolling box whether it actually scrolls, and which
 * edges have more behind them.
 *
 * Two things hang off this. A scroll container is only reachable by keyboard
 * if it is focusable, but making EVERY code block and table a tab stop would
 * bury the page's real links under dozens of stops that do nothing — so
 * `tabIndex` is granted only when the content overflows. And an overflowing
 * box gives no visual hint that it overflows (overlay scrollbars hide), hence
 * the edge-fade cue the stylesheet draws from `fadeStart`/`fadeEnd`.
 *
 * jsdom has no layout, so every measurement is 0 there and this reports
 * "not scrollable"; tests drive it by stubbing the element's metrics. Whether
 * the measurements are right is a real-browser question.
 */
export function useScrollEdges(ref: RefObject<HTMLElement>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(NONE);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    const measure = () => {
      const overflow = element.scrollWidth - element.clientWidth;
      const scrollable = overflow > 1;
      // Sub-pixel scroll positions would otherwise leave a permanent sliver
      // of fade at the end of a fully scrolled box.
      const next: ScrollEdges = {
        scrollable,
        fadeStart: scrollable && element.scrollLeft > 1,
        fadeEnd: scrollable && element.scrollLeft < overflow - 1,
      };
      setEdges(prev =>
        prev.scrollable === next.scrollable &&
        prev.fadeStart === next.fadeStart &&
        prev.fadeEnd === next.fadeEnd
          ? prev
          : next,
      );
    };
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    // Absent in jsdom and very old browsers; the scroll listener and the first
    // measurement still work without it.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [ref]);

  return edges;
}

/** Props that make a scroll container keyboard-reachable and cue its edges. */
export function scrollRegionProps(
  edges: ScrollEdges,
  label: string,
): Record<string, string | number | undefined> {
  return {
    'data-fade-start': edges.fadeStart ? 'true' : undefined,
    'data-fade-end': edges.fadeEnd ? 'true' : undefined,
    // A role="region" without a name is a landmark with no label, so the two
    // travel together, and only when there is something to scroll.
    ...(edges.scrollable
      ? { tabIndex: 0, role: 'region', 'aria-label': label }
      : undefined),
  };
}
