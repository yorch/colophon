import { useEffect, useState } from 'react';

/**
 * The anchor of the heading the reader is currently in, for the table of
 * contents to mark.
 *
 * A heading is "current" from the moment it reaches the top band of the
 * viewport until the next one does. The band is the top ~30% (the bottom 70%
 * is cut off by `rootMargin`), so the highlight changes as a section starts to
 * read rather than when its heading is already at the very top. When no
 * heading is inside the band — a long section between two headings — the last
 * one stays active instead of the highlight blinking out.
 *
 * The headings live in the markdown that a SIBLING component renders, and may
 * arrive after this does (the page body is fetched separately from the
 * manifest the ToC is built from). Elements that are not there yet are looked
 * for again as the DOM changes, and the watcher stops once all are found.
 *
 * Guarded for `IntersectionObserver` being absent (jsdom, very old browsers):
 * the highlight is an enhancement, so nothing is marked rather than failing.
 */
export function useActiveHeading(anchors: string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>();
  // A stable dependency: the array identity changes on every parent render.
  const key = anchors.join('\n');

  useEffect(() => {
    const ids = key ? key.split('\n') : [];
    if (ids.length === 0 || typeof IntersectionObserver === 'undefined') {
      setActive(undefined);
      return undefined;
    }

    const visible = new Set<string>();
    const observed = new Set<string>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }
        // Document order, not arrival order: with two headings in the band the
        // earlier one is the section being read.
        const first = ids.find(id => visible.has(id));
        if (first) {
          setActive(first);
        }
      },
      { rootMargin: '0px 0px -70% 0px' },
    );

    const connect = () => {
      for (const id of ids) {
        const element = observed.has(id) ? null : document.getElementById(id);
        if (element) {
          observed.add(id);
          observer.observe(element);
        }
      }
      return observed.size === ids.length;
    };

    let mutations: MutationObserver | undefined;
    if (!connect() && typeof MutationObserver !== 'undefined') {
      mutations = new MutationObserver(() => {
        if (connect()) {
          mutations?.disconnect();
        }
      });
      mutations.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      mutations?.disconnect();
      observer.disconnect();
    };
  }, [key]);

  return active;
}
