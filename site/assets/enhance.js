// Progressive enhancement shared by every page. Nothing here is required to
// read the site: without JS the code blocks are plain blocks, the on-page
// contents list stays open, and the browser's own keyboard handling for
// scrollers applies. Kept apart from theme.js, which is chrome and is checked
// as such; this is not.

{
  /** Text of a node with markup and runs of whitespace flattened. */
  const textOf = node => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------- scrollers
  //
  // A region that scrolls sideways but cannot take focus is unreachable by
  // keyboard, and a screen reader meets it as an unnamed blob. Doing this at
  // runtime rather than in markup means only regions that actually overflow at
  // the current width get a tab stop: marking every code block statically adds
  // ~20 stops on the longest page, nearly all of them to blocks that fit.
  const SCROLLERS = '.figure-scroll, .table-wrap, .code pre, .terminal pre';

  const nameFor = el => {
    if (el.matches('.table-wrap')) {
      return `Table: ${textOf(el.querySelector('caption')) || 'scrollable'}`;
    }
    if (el.matches('.figure-scroll')) {
      const svg = [...el.querySelectorAll('svg')].find(
        node => node.getClientRects().length > 0,
      );
      const title = svg?.getAttribute('aria-labelledby')?.split(' ')[0];
      return `Diagram: ${textOf(document.getElementById(title)) || 'scrollable'}`;
    }
    const figure = el.closest('figure');
    const head = figure
      ?.querySelector('figcaption, .term-head')
      ?.cloneNode(true);
    head?.querySelector('.copy-btn')?.remove();
    const caption = textOf(head);
    return `Code: ${caption || 'scrollable'}`;
  };

  const syncScrollers = () => {
    for (const el of document.querySelectorAll(SCROLLERS)) {
      if (el.scrollWidth > el.clientWidth + 1) {
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', nameFor(el));
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    }
  };

  syncScrollers();
  if ('ResizeObserver' in window) {
    // Observing the body rather than each scroller: widths only change when
    // the layout does, and one observer is cheaper than twenty.
    new ResizeObserver(syncScrollers).observe(document.body);
  } else {
    addEventListener('resize', syncScrollers);
  }

  // ------------------------------------------------------------- copy buttons
  if (navigator.clipboard?.writeText) {
    const status = document.createElement('p');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    document.body.appendChild(status);

    for (const figure of document.querySelectorAll('.code, .terminal')) {
      const pre = figure.querySelector('pre');
      const head = figure.querySelector('figcaption, .term-head');
      if (!pre || !head) {
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-btn';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', `Copy ${textOf(head)}`);
      button.addEventListener('click', async () => {
        // A terminal transcript mixes commands with their output; what a reader
        // wants on the clipboard is the commands. An elided one ("...") would
        // paste as something that does not run, so it is left out.
        const commands = [...pre.querySelectorAll('.c')].filter(
          node => !node.textContent.includes('...'),
        );
        const text = commands.length
          ? commands.map(node => node.textContent).join('\n')
          : pre.textContent;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied';
          status.textContent = 'Copied to clipboard';
        } catch {
          button.textContent = 'Copy failed';
          status.textContent = 'Copy failed';
        }
        setTimeout(() => {
          button.textContent = 'Copy';
          status.textContent = '';
        }, 1800);
      });
      head.appendChild(button);
      figure.classList.add('has-copy');
    }
  }

  // --------------------------------------------------------------- disclosures
  // The contents list ships open so it works without JS; on a phone it is
  // chrome standing between the reader and the first paragraph.
  if (matchMedia('(max-width: 760px)').matches) {
    for (const toc of document.querySelectorAll(
      'details[data-collapse-narrow]',
    )) {
      toc.open = false;
    }
  }

  // A link into a collapsed <details> would otherwise land on nothing.
  const revealHash = () => {
    const target =
      location.hash && document.getElementById(location.hash.slice(1));
    let opened = false;
    for (let node = target; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS' && !node.open) {
        node.open = true;
        opened = true;
      }
    }
    // The browser has already scrolled to where the target was while hidden,
    // which is nowhere useful; only a reveal needs a second scroll.
    if (opened) {
      target.scrollIntoView();
    }
  };
  if (location.hash) {
    revealHash();
  }
  addEventListener('hashchange', revealHash);
}
