// The theme toggle, shared by every page.
//
// Extracted from the five pages because it was the one region genuinely
// byte-identical across all of them. The header and footer only LOOK
// duplicated: they carry per-page `aria-current` and omit their own link,
// so freezing them into one fragment would drop those affordances.
//
// The render-blocking snippet in <head> stays inline and is NOT this file.
// It runs before the first paint so a stored choice never flashes the wrong
// theme; deferring it would move it after the frame that would be wrong.

{
  const root = document.documentElement;
  const button = document.querySelector('[data-theme-toggle]');

  // system -> light -> dark -> system. Three states rather than two so
  // a reader can hand control back to the operating system, which a
  // plain on/off switch cannot express.
  const ORDER = ['system', 'light', 'dark'];
  const LABEL = {
    system: 'Theme: following system. Switch to light.',
    light: 'Theme: light. Switch to dark.',
    dark: 'Theme: dark. Follow system.',
  };

  const current = () => root.getAttribute('data-theme') || 'system';

  const describe = () => {
    const label = LABEL[current()];
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  };

  // The theme-color metas are media-query driven, which cannot see an
  // explicit choice — so the browser chrome would keep following the
  // system while the page did not.
  const applyThemeColor = state => {
    const dark =
      state === 'dark' ||
      (state === 'system' &&
        matchMedia('(prefers-color-scheme: dark)').matches);
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', dark ? '#101312' : '#fbfaf7');
  };

  const apply = next => {
    if (next === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }
    try {
      if (next === 'system') {
        localStorage.removeItem('colophon-theme');
      } else {
        localStorage.setItem('colophon-theme', next);
      }
    } catch {
      // Not persisting is survivable; the toggle still works for this
      // page view.
    }
    describe();
    applyThemeColor(next);
  };

  if (button) {
    button.addEventListener('click', () => {
      apply(ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length]);
    });
    describe();
    applyThemeColor(current());
  }
}
