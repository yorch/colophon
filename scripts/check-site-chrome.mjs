#!/usr/bin/env node
/**
 * Fails when the header, footer, or theme wiring drifts apart across the five
 * hand-written pages under `site/`.
 *
 * The site has no build step and no templating layer, on purpose — five plain
 * files a reader can open and understand. The cost of that choice is that the
 * chrome is copied by hand, and copies rot: a footer link was once added by
 * matching a hardcoded page name, landed on three pages, and silently skipped
 * the other two. Nobody noticed until someone clicked around.
 *
 * Extracting the theme toggle into `assets/theme.js` removed the duplication
 * that was easiest to remove; the header and footer stay copied because
 * de-duplicating them would mean adopting the build step the site was designed
 * to avoid. So the duplication stays and this checks it instead.
 *
 * Note what a naive version of this check would get wrong, because both of
 * these are load-bearing:
 *
 *   - The five headers are the same *length* but have five distinct hashes.
 *     `aria-current="page"` moves between the five nav entries and costs the
 *     same bytes wherever it lands, so comparing sizes reports five identical
 *     headers no matter how badly they have diverged. Structure is compared
 *     here, never size.
 *   - Each footer deliberately links to the other four pages and omits itself,
 *     so "all footers must match" is the wrong rule. What must match is the
 *     footer with its page-link list taken out, plus the link list being
 *     exactly the other four.
 */
import { readFileSync } from 'node:fs';

/**
 * Every page of the site, in the order the nav lists them.
 *
 * The order matters: the nav is compared against this sequence, so a link
 * added in the wrong place is a failure and not just a reshuffle.
 */
const PAGES = [
  'index.html',
  'architecture.html',
  'implementation.html',
  'agents.html',
  'getting-started.html',
];

/**
 * The page every other page is compared against.
 *
 * Something has to be the reference; it is named in the failure messages so
 * that "these two disagree" does not get read as "this one is wrong".
 */
const REFERENCE = PAGES[0];

const SITE = new URL('../site/', import.meta.url);

/** The one script tag every page is expected to load the toggle from. */
const THEME_SCRIPT = '<script src="assets/theme.js" defer></script>';

const failures = [];

/** Records a failure against a page, naming the rule that caught it. */
function fail(page, rule, detail) {
  failures.push({ page, rule, detail });
}

/**
 * Returns the text between `open` and the end of `close`, or null.
 *
 * Deliberately not a parser: the blocks being extracted are `<header>` and
 * `<footer>`, neither of which nests inside itself, so finding the first
 * opening tag and the first closing tag after it is exact here and stays
 * zero-dependency.
 */
function block(html, open, close) {
  const start = html.indexOf(open);
  if (start === -1) {
    return null;
  }
  const end = html.indexOf(close, start);
  if (end === -1) {
    return null;
  }
  return html.slice(start, end + close.length);
}

/** Every `<a href="...">text</a>` in a fragment, in document order. */
function links(fragment) {
  return [
    ...fragment.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g),
  ].map(match => ({ href: match[1], text: match[2].trim() }));
}

/** Inline `<script>` bodies — script tags that load nothing external. */
function inlineScripts(html) {
  return [
    ...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g),
  ].map(match => ({ index: match.index, body: match[1] }));
}

/**
 * Where two blocks first disagree, as a line number and both versions.
 *
 * The point of the checker is to be fixable without opening a diff tool, so a
 * mismatch has to say which line and what it says on each side.
 */
function firstDifference(reference, subject) {
  const expected = reference.split('\n');
  const actual = subject.split('\n');
  for (let i = 0; i < Math.max(expected.length, actual.length); i += 1) {
    if (expected[i] !== actual[i]) {
      return {
        line: i + 1,
        expected: expected[i] === undefined ? '(nothing)' : expected[i].trim(),
        actual: actual[i] === undefined ? '(nothing)' : actual[i].trim(),
      };
    }
  }
  return null;
}

/** Collapses runs of whitespace so indentation alone is never a failure. */
function squash(text) {
  return text.replace(/\s+/g, ' ').trim();
}

const pages = PAGES.map(name => ({
  name,
  html: readFileSync(new URL(name, SITE), 'utf8'),
}));

for (const page of pages) {
  const { name, html } = page;

  page.header = block(html, '<header class="site-header">', '</header>');
  if (page.header === null) {
    fail(name, 'header', 'no <header class="site-header"> … </header> block');
    continue;
  }

  page.footer = block(html, '<footer class="site-footer">', '</footer>');
  if (page.footer === null) {
    fail(name, 'footer', 'no <footer class="site-footer"> … </footer> block');
    continue;
  }

  const nav = block(page.header, '<nav class="site-nav"', '</nav>');
  if (nav === null) {
    fail(name, 'nav', 'no <nav class="site-nav"> … </nav> inside the header');
    continue;
  }
  page.nav = nav;
  page.navLinks = links(nav);
}

// ---------------------------------------------------------------------------
// The nav lists every page, in order.
// ---------------------------------------------------------------------------
for (const { name, navLinks } of pages) {
  if (!navLinks) {
    continue;
  }
  const hrefs = navLinks.map(link => link.href);
  if (hrefs.join(' ') !== PAGES.join(' ')) {
    fail(
      name,
      'nav',
      `nav links to [${hrefs.join(', ')}] but must link to all five pages in ` +
        `order: [${PAGES.join(', ')}]`,
    );
  }
}

// ---------------------------------------------------------------------------
// Exactly one nav entry carries aria-current="page", and it is this page's.
//
// This is the attribute the header comparison below has to ignore, so nothing
// else is watching it. Left unchecked, a copied header would sail through
// every other rule while telling every reader they are on the Overview page.
// ---------------------------------------------------------------------------
for (const { name, nav, navLinks } of pages) {
  if (!navLinks) {
    continue;
  }
  const marked = navLinks.filter(link =>
    new RegExp(`<a\\s[^>]*href="${link.href}"[^>]*aria-current="page"`).test(
      nav,
    ),
  );
  if (marked.length === 0) {
    fail(
      name,
      'aria-current',
      `no nav entry carries aria-current="page"; it belongs on "${name}"`,
    );
  } else if (marked.length > 1) {
    fail(
      name,
      'aria-current',
      `${marked.length} nav entries carry aria-current="page" ` +
        `(${marked.map(link => link.href).join(', ')}); only "${name}" should`,
    );
  } else if (marked[0].href !== name) {
    fail(
      name,
      'aria-current',
      `aria-current="page" is on "${marked[0].href}" but this page is ` +
        `"${name}"; each page must mark its own nav entry`,
    );
  }
}

// ---------------------------------------------------------------------------
// The headers are identical apart from where aria-current="page" sits.
//
// Stripping the attribute is the whole point: it is the one difference the
// five pages are allowed to have, and it is also the one that makes the five
// headers the same number of bytes while being five different strings.
// ---------------------------------------------------------------------------
const stripCurrent = header => header.replaceAll(' aria-current="page"', '');
const referencePage = pages.find(page => page.name === REFERENCE);

for (const { name, header } of pages) {
  if (!header || name === REFERENCE || !referencePage?.header) {
    continue;
  }
  const difference = firstDifference(
    stripCurrent(referencePage.header),
    stripCurrent(header),
  );
  if (difference) {
    fail(
      name,
      'header',
      `header differs from ${REFERENCE} at line ${difference.line} of the ` +
        `header block (ignoring aria-current):\n` +
        `      ${REFERENCE}: ${difference.expected}\n` +
        `      ${name}: ${difference.actual}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Each footer links to exactly the other four pages, and never to itself.
//
// Self-omission is deliberate — there is no reason to offer the reader a link
// to the page they are reading — which is why this is a set comparison rather
// than the "all footers match" rule the header gets.
// ---------------------------------------------------------------------------
/** Pages whose footer link list is already known wrong. */
const badFooterLinks = new Set();

for (const { name, footer } of pages) {
  if (!footer) {
    continue;
  }
  const pageLinks = links(footer)
    .map(link => link.href)
    .filter(href => PAGES.includes(href));
  const expected = PAGES.filter(page => page !== name);

  if (pageLinks.includes(name)) {
    badFooterLinks.add(name);
    fail(name, 'footer', 'footer links to its own page; it must omit itself');
  } else if (pageLinks.join(' ') !== expected.join(' ')) {
    badFooterLinks.add(name);
    const missing = expected.filter(page => !pageLinks.includes(page));
    const detail = missing.length
      ? `missing [${missing.join(', ')}]`
      : `links to [${pageLinks.join(', ')}]`;
    fail(
      name,
      'footer',
      `footer must link to the other four pages in order ` +
        `[${expected.join(', ')}] — ${detail}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Everything in the footer other than that page-link list is shared.
//
// Take the four page links out and what is left — the licence line, the
// separators, the GitHub link — is chrome, and has to be the same everywhere.
// This is what catches a footer whose wording was updated on one page only.
//
// Pages that already failed the rule above are skipped: a link added or
// dropped also changes the number of "·" separators left behind, so reporting
// that too would be the same fault described twice, the second time in terms
// that point away from the actual edit.
// ---------------------------------------------------------------------------
const stripPageLinks = footer =>
  squash(
    footer.replace(
      /<a\s[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/g,
      (tag, href) => (PAGES.includes(href) ? '' : tag),
    ),
  );

for (const { name, footer } of pages) {
  if (
    !footer ||
    name === REFERENCE ||
    !referencePage?.footer ||
    badFooterLinks.has(name)
  ) {
    continue;
  }
  const expected = stripPageLinks(referencePage.footer);
  const actual = stripPageLinks(footer);
  if (expected !== actual) {
    fail(
      name,
      'footer',
      `footer differs from ${REFERENCE} outside the page-link list:\n` +
        `      ${REFERENCE}: ${expected}\n` +
        `      ${name}: ${actual}`,
    );
  }
}

// ---------------------------------------------------------------------------
// One inline script per page, in <head>, byte-identical everywhere.
//
// That script is the render-blocking anti-flash snippet, and it only works
// where it is: before the stylesheet paints. A second inline script anywhere
// is the toggle creeping back in-page after being extracted to assets/theme.js
// — which is how the copies started last time.
// ---------------------------------------------------------------------------
for (const page of pages) {
  const { name, html } = page;
  const headEnd = html.indexOf('</head>');
  const scripts = inlineScripts(html);

  if (scripts.length === 0) {
    fail(
      name,
      'head-script',
      'no inline <script> — the anti-flash snippet is gone',
    );
    continue;
  }
  if (scripts.length > 1) {
    const stray = scripts.filter(script => script.index > headEnd).length;
    fail(
      name,
      'head-script',
      `${scripts.length} inline <script> blocks, ${stray} of them after ` +
        `</head>; exactly one is allowed, the anti-flash snippet in <head>. ` +
        `Anything else belongs in assets/theme.js`,
    );
    continue;
  }
  if (scripts[0].index > headEnd) {
    fail(
      name,
      'head-script',
      'the inline <script> is after </head>; the anti-flash snippet only ' +
        'works before the stylesheet paints',
    );
    continue;
  }
  page.headScript = scripts[0].body;
}

for (const { name, headScript } of pages) {
  if (headScript === undefined || name === REFERENCE) {
    continue;
  }
  const reference = referencePage?.headScript;
  if (reference === undefined || headScript === reference) {
    continue;
  }
  const difference = firstDifference(reference, headScript);
  fail(
    name,
    'head-script',
    `inline head script differs from ${REFERENCE} at line ` +
      `${difference.line}:\n` +
      `      ${REFERENCE}: ${difference.expected}\n` +
      `      ${name}: ${difference.actual}`,
  );
}

// ---------------------------------------------------------------------------
// Every page loads the shared toggle, exactly once.
// ---------------------------------------------------------------------------
for (const { name, html } of pages) {
  const count = html.split(THEME_SCRIPT).length - 1;
  const anyReference = html.match(/<script[^>]*\ssrc="[^"]*theme\.js"[^>]*>/g);

  if (count === 1) {
    continue;
  }
  if (count === 0 && anyReference) {
    fail(
      name,
      'theme-script',
      `loads theme.js as \`${anyReference[0]}\` — every page must use the ` +
        `same tag: \`${THEME_SCRIPT}\``,
    );
  } else if (count === 0) {
    fail(
      name,
      'theme-script',
      `no \`${THEME_SCRIPT}\` — the theme toggle will not work on this page`,
    );
  } else {
    fail(
      name,
      'theme-script',
      `${count} copies of \`${THEME_SCRIPT}\`; it must appear exactly once`,
    );
  }
}

if (failures.length > 0) {
  const byPage = PAGES.map(page => ({
    page,
    found: failures.filter(failure => failure.page === page),
  })).filter(({ found }) => found.length > 0);

  process.stderr.write(
    `\nThe shared chrome has drifted across site/:\n\n${byPage
      .map(
        ({ page, found }) =>
          `  site/${page}\n${found
            .map(failure => `    ${failure.rule}: ${failure.detail}`)
            .join('\n')}`,
      )
      .join('\n\n')}\n\n` +
      'The five pages are copied by hand and share no template, so a change to\n' +
      'the header, the footer, or the theme wiring has to be made in all five.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `${PAGES.length} site pages share the same header, footer, and theme wiring.\n`,
);
