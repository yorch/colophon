import { useEffect } from 'react';

/** How long to keep re-aligning while late content settles. */
const SETTLE_MS = 1500;

export interface AnchorScrollOptions {
  /** The URL fragment, with or without its leading `#`. */
  hash: string | undefined;
  /** Whether the content containing the target has rendered. */
  ready: boolean;
}

/**
 * Puts the viewport where the reader expects it: on the heading named by the
 * URL fragment, or at the top of a page opened without one.
 *
 * The browser will not do this for us, for two independent reasons, and both
 * had to be fixed at once because either alone leaves the link broken:
 *
 * 1. Page bodies are fetched after mount. On a cold load the browser resolves
 *    the fragment while the document is still the empty shell, finds nothing,
 *    and never tries again once the markdown arrives.
 *
 * 2. Backstage renders inside react-aria's RouterProvider, which intercepts
 *    anchor clicks and hands them to the client router. The router pushes
 *    history state, and pushState does not scroll — nor does it fire
 *    `hashchange`, so listening for that event would not see it either.
 *
 * This matters more than a table of contents: every search result is a
 * heading-level deep link, which is the whole point of chunking at H2 and H3.
 * Without this, all of them land at the top of the page.
 *
 * Late layout shifts are handled by re-aligning while the document keeps
 * growing — mermaid diagrams render asynchronously and can move a heading
 * hundreds of pixels after the markdown itself is done. Any deliberate scroll
 * by the reader ends that, because correcting someone who has started reading
 * is worse than landing slightly off.
 */
export function useAnchorScroll({ hash, ready }: AnchorScrollOptions): void {
  useEffect(() => {
    if (!ready || typeof document === 'undefined') {
      return undefined;
    }

    const id = hash?.replace(/^#/, '');
    if (!id) {
      // No fragment means the reader opened a page rather than a section, and
      // `ready` has just gone false-then-true because the body was refetched.
      // Client-side routing preserves the scroll offset across that, so
      // without this you land partway into a document you have never seen.
      window.scrollTo(0, 0);
      return undefined;
    }

    let target = document.getElementById(decodeURIComponent(id));
    if (!target) {
      return undefined;
    }

    const align = () => target?.scrollIntoView();
    align();

    // ResizeObserver rather than a fixed delay: it fires when the document
    // actually changes height, so a page with no late content pays nothing
    // and a page full of diagrams stays correct however long they take.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(align);
    observer?.observe(document.documentElement);

    const stop = () => {
      observer?.disconnect();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
      window.removeEventListener('keydown', stop);
      target = null;
    };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchmove', stop, { passive: true });
    window.addEventListener('keydown', stop);
    const timer = setTimeout(stop, SETTLE_MS);

    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [hash, ready]);
}
