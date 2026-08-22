import { useEffect, useState } from 'react';

export interface ContainerWidth {
  /** Attach to the element to measure. */
  ref: (node: HTMLElement | null) => void;
  /** Undefined until the first measurement. */
  width: number | undefined;
}

/**
 * The measured inline size of an element.
 *
 * Companion to the container queries in the stylesheet, measuring the same
 * thing they do. A media query would answer the wrong question: this renders
 * both as a full page and inside an entity tab, where the catalog's own chrome
 * takes a large share of the window — so viewport width says nothing about how
 * much room it actually has.
 *
 * A CALLBACK ref, not a ref object. A component that returns a loading state
 * before its real markup has no element to observe on mount, and an effect
 * keyed on a ref object never re-runs when one finally appears — the ref
 * identity is stable, so the observer is set up once against null and stays
 * that way. Holding the node in state re-runs the effect the moment it
 * attaches.
 */
export function useContainerWidth(): ContainerWidth {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { ref: setNode, width };
}
