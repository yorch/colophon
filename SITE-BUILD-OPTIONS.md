# Should `site/` have a build step?

An investigation into the duplicated chrome across the five hand-written pages
in `site/`, the realistic ways to remove it, and a recommendation.

Nothing here has been implemented. This document is the decision, not the
change.

---

## 1. The problem

`site/` is five hand-written HTML files sharing one stylesheet
(`site/assets/style.css`), deployed to GitHub Pages by
`.github/workflows/pages.yml`, which uploads the directory as an artifact with
no build step at all.

Measured on the current `main`:

| | bytes | share of all HTML |
| --- | ---: | ---: |
| All five HTML files | 133,830 | 100% |
| `<head>` (5 copies) | 7,946 | 5.9% |
| `<header>` (5 copies, 2,758 each) | 13,790 | 10.3% |
| `<footer>` (5 copies) | 3,129 | 2.3% |
| **head + header + footer** | **24,865** | **18.6%** |
| Theme-toggle `<script>` at the end of `<body>` (5 copies, 2,497 each) | 12,485 | 9.3% |
| **All repeated chrome** | **37,350** | **27.9%** |

The regions are easy to find by hand: every page has `</head>` on line 33,
`</header>` on line 74, and a `<footer class="site-footer">` followed by a
`<script>` block that runs to the end of the file.

### The chrome is not actually identical, and that is the whole problem

It is tempting to read "18% duplication" as "one block, copied five times,
extract it". The bytes do not support that. Of the four repeated regions, only
one is byte-identical:

| Region | Identical across pages? | What varies |
| --- | --- | --- |
| `<head>` | No — 5 variants | `<title>` (line 6) and `<meta name="description">` (line 9). Nothing else. |
| `<header>` | **No — 5 variants, all exactly 2,758 bytes** | Which `<li><a>` carries `aria-current="page"`. |
| `<footer>` | No — 5 variants | The link list is *the other four pages*: each page omits itself. |
| Trailing `<script>` | **Yes — SHA-256 identical on all five** | Nothing. |

The `<header>` being the same length on every page is what makes it *look*
byte-identical to a size check. It is not: the `aria-current="page"` attribute
moves between five different `<li>` elements, which costs the same bytes
wherever it lands.

That detail decides several of the options below. Any mechanism that injects
one frozen fragment into five pages — an `<iframe>`, a `<template>` cloned by
JavaScript, a naive `cat header.html >> page.html` — **silently drops both the
current-page indicator and the footer's self-omission**. Two accessibility
affordances would be lost to a change made in the name of maintainability.

So the real shape of the problem is not "one shared block". It is: **four
regions, parameterised by exactly four values** — `title`, `description`, the
current page's slug, and (derived from that slug) the footer's link list.

### Is the duplication actually causing problems?

Yes, once, provably — and the mechanism is instructive.

The footer's per-page link list is exactly the trap that fired. Adding a link
to the footer by matching a hardcoded page name works on the pages where that
name appears and does nothing on the page where it is the *current* page and
therefore absent. `architecture.html`'s footer differs from `index.html`'s in
one line; `getting-started.html`'s differs in four. A search-and-replace that
assumes uniformity finds four of five sites, or three of five, and reports
success.

The honest counter-case is in §2, option A. But the failure is not
hypothetical, and it is structural rather than careless: the footer is
*designed* to differ per page, so "make them all the same" is not even the
correct fix.

### What a build step would have to not break

Read `site/assets/style.css` and any of the five pages before reaching for a
generator. This is not a docs theme with content poured into it:

- **1,198 lines of bespoke CSS** with no external assets, no font loading, and
  no framework. Design tokens, a `container-type: inline-size` container query
  at line 1021, `color-mix()`, `prefers-reduced-motion`, and a hand-rolled
  three-way theme system (`system` → `light` → `dark`) implemented as
  `:root[data-theme=…]` plus `@media (prefers-color-scheme: dark)`.
- **31 inline `<svg>` elements**, including hand-authored architecture diagrams
  built from `.node` / `.edge` / `.head` / `.t-mono` classes that are styled and
  themed by the stylesheet. These are not images; they are themed markup.
- **Mock UI components** (`.mock-frame`, `.mock-topbar`, `.mock-tabs`,
  `.mock-nav`, `.mock-chip`) that fake the Backstage interface in HTML/CSS.
- **A terminal component** (`.terminal` with `.p` / `.c` / `.n` spans) and a
  code component (`.code` with `.cm` comment spans — `getting-started.html`
  alone uses 23 of them).
- **A render-blocking inline `<script>` in `<head>`**, deliberately inline and
  deliberately blocking, with a comment explaining that a deferred script would
  run after the first frame — "which is the frame that would be wrong".

The bodies of these pages are not Markdown and cannot become Markdown without
losing all of the above. Any option evaluated below is evaluated on whether the
*body* survives untouched.

### Two constraints from the repository, not the site

**`yarn build` does not and will not cover `site/`.** The root script is
`backstage-cli repo build --all`, which builds Yarn workspaces. The workspace
globs are `packages/*`, `plugins/*`, `dev-app/*` — `site/` is not a workspace
and is not in `tsconfig.json`'s `include` either. A site build needs its own
root script and its own CI wiring; it will not be picked up for free.

**The dependency surface is a stated value.** `README.md` spends a section
justifying why there are *two* linters, and concludes "Do not add stylistic
rules to `.eslintrc.js`." `AGENTS.md` repeats it. A project that argues that
carefully about a second ESLint config has a high bar for a first static site
generator.

---

## 2. Options

Each option is scored on four axes: what it costs to adopt, what it costs to
maintain, what it does to the deploy, and what it breaks.

### A. Do nothing

Keep five hand-written files. Accept that a nav change is five edits.

**Adopt cost:** zero.

**Maintain cost:** five edits per chrome change. The nav has five entries and
has been stable; the footer has five links. Realistically this is a handful of
edits per year, each of which is a two-minute job — *if you remember all five
files and notice that the footer differs per page*.

**Deploy:** unchanged. `pages.yml` uploads `site/` as-is. Local preview is
`open site/index.html`. Both of these are genuinely valuable and every other
option puts at least one at risk.

**What it breaks:** nothing, which is the point. The risk is not breakage, it
is silent partial application — which has already happened once.

**The honest case for it:** five pages is below the threshold where templating
pays for itself. The chrome is 18.6% of bytes but the pages are 133 KB of
*prose and diagrams*; nobody is scrolling past the header to find the content
in a text editor, because the header is on lines 38–74 of every file and
`<main>` opens on line 75. `git grep` finds all five occurrences of any nav
string in one command. The duplication costs nothing at runtime — bytes gzip to
near-nothing precisely because they repeat. And a site whose whole selling
point is craft has some claim to being hand-made.

The counter is that "remember all five files" is exactly the memory that
failed, and the footer's deliberate per-page variation means the five files are
not even a straight copy — a reviewer diffing them sees noise and stops
reading.

### B. Do nothing, plus a drift check (recommended — see §3)

Keep the five hand-written files exactly as they are. Add one zero-dependency
Node script that *asserts* the chrome is consistent, and wire it into
`yarn verify`.

The script does not generate anything. It reads all five pages and fails if:

- the `<header>` blocks differ by anything other than the position of
  `aria-current="page"`;
- any page's `aria-current` does not point at itself;
- any page's footer link set is not exactly "the other four pages, plus
  GitHub";
- the trailing `<script>` blocks are not byte-identical (or, after step one
  below, that any page has an inline copy at all).

```
$ yarn verify
site chrome: getting-started.html footer is missing a link to agents.html
```

**Adopt cost:** one new file, `scripts/check-site-chrome.mjs`, roughly 90 lines
of zero-dependency Node with a comment block explaining why it exists — the
same shape and register as the existing `scripts/check-packables.mjs`. One line
changed in `package.json` to append it to `verify`. Total diff: **+1 file, ~90
added lines, 1 changed line.** No dependency, no lockfile churn.

**Maintain cost:** still five edits per chrome change — but a wrong edit now
fails CI in seconds instead of shipping. Adding a sixth page means adding it to
the script's page list (one line) or, better, deriving the list from
`readdirSync('site')` so it needs no maintenance at all.

**Deploy:** completely unchanged. `pages.yml` is not touched. `.nojekyll` stays.
`open site/index.html` still works.

**What it breaks:** nothing. It is additive and read-only.

**Honest weakness:** it removes the *risk* without removing the *work*. Five
edits is still five edits. It is the right trade only because five edits is
cheap and the risk was the expensive part.

### C. A tiny prebuild script (zero dependencies)

`scripts/build-site.mjs` reads `site/_chrome/{head,header,footer}.html` plus a
small page manifest and writes the five pages. Two sub-variants:

**C1 — separate source and output** (`site/src/*.html` → `site/dist/`).
`pages.yml` must gain checkout/setup-node/`yarn install --immutable`/build
steps and upload `site/dist` instead of `site/`. `.gitignore` and `biome.json`
both need a new exclusion. Local preview becomes "run the build first".

**C2 — generate in place, commit the output.** The five `site/*.html` files
stay in git as the deployed artifact; the script splices the chrome regions
between marker comments and CI runs it in `--check` mode. `pages.yml` is
untouched, `open site/index.html` still works, and drift becomes impossible
because CI fails on a stale file.

**Adopt cost (C2):** `scripts/build-site.mjs` (~130 lines), three partials
(~90 lines total moved out of the pages), ten marker comments across the five
pages, two `package.json` scripts. Roughly **+220 / −0 lines** — the chrome
bytes stay in the committed output by design.

**Maintain cost:** one edit per chrome change, then `yarn build:site`. But you
now own a template engine. It will be asked to grow: a third variable, a
conditional, a loop over nav items. Every hand-rolled templater in history has
been asked to grow.

**The near-zero-dependency variant:** `posthtml@0.16.7` (2 deps) plus
`posthtml-include@2.0.1` (3 deps) expands `<include src="header.html">` in
about twenty lines of driver script. Five packages instead of a hand-rolled
parser. Against it: `posthtml` has not moved in a long time, and the `<include>`
element only substitutes files — it does not take parameters, so the
`aria-current` and footer-omission problems come straight back and you write
the parameterisation by hand anyway.

**Deploy:** unchanged for C2; three new steps and a ~90-second `yarn install`
for C1.

**What it breaks:** C2 commits generated files, which is a real smell and makes
`git blame` on the chrome point at the script rather than the author. C1 breaks
the documented "no build step" property of the deploy and the one-command local
preview.

### D. Build-free includes in the browser (`<template>` + JS, `<iframe>`, `<object>`)

**Rejected, and worth saying why explicitly, because it is the option that
sounds free.**

Injecting the header from JavaScript means:

- **No header without JavaScript.** The primary nav and the skip-link target
  disappear for any reader with JS off or blocked, and for anything crawling
  the page.
- **Layout shift.** The header is `position: sticky` and 2,758 bytes of markup.
  Painting the page and then inserting it above the fold is a guaranteed CLS
  hit on a site that currently has none.
- **It fights the site's own design.** `<head>` carries a deliberately
  render-blocking inline script whose comment says a deferred script "would run
  after the first frame, which is the frame that would be wrong". Deferring the
  entire header is a strictly larger version of the bug that script exists to
  prevent.
- **It cannot express the parameterisation** without re-deriving the current
  page from `location.pathname` at runtime, which means `aria-current` and the
  footer's self-omission are computed after paint — announced late or not at
  all by assistive technology.

`<iframe>`/`<object>` embedding is worse: a nested browsing context for site
navigation breaks in-page focus order, `position: sticky`, and the theme
cascade, since the iframe document does not inherit `:root[data-theme]`.

**And there is no native alternative.** HTML Imports were never standardised —
W3C republished the spec as a *Discontinued Draft* on 2023-06-15, and Chrome
removed the implementation in version 80. Declarative Shadow DOM
(`<template shadowrootmode>`) reached Baseline "widely available" on
2026-08-20, but it declares shadow content *inline in the same document*: it
gives encapsulation, not deduplication, and you would still paste the header
into all five files. A WHATWG proposal for a declarative `<include>` element
was opened on 2026-08-02 (`whatwg/html#12747`) and carries the
`needs implementer interest` label with no vendor commitment — three weeks old,
zero implementations, not something to wait for.

Server Side Includes are also out: GitHub Pages serves static files with no
`mod_include`, so `<!--#include -->` never executes. SSI only works as a
*pre-processing* step whose output you commit — which is option C.

**On static hosting today there is no native, build-free, crawlable HTML
include.** The only crawlable options are a build step or duplication.

### E. Jekyll — "free" on GitHub Pages

GitHub Pages has built-in Jekyll — currently **Jekyll 3.10.0** via the
`github-pages` gem **v232** on **Ruby 3.3.4** — with `_layouts` and `_includes`,
which is precisely the missing feature, at the cost of one `_config.yml` and
deleting `.nojekyll`. Zero dependencies on our side. It is genuinely the
smallest-footprint templating option that exists.

**Catch one: `.nojekyll` and Jekyll includes are mutually exclusive.** That file
exists to disable Jekyll entirely — layouts, includes and all Liquid
processing. You cannot keep it and use `{% include %}`.

**Catch two:** built-in Jekyll only applies to the *branch-based* Pages
publishing source.
This repository deploys through GitHub Actions with
`actions/upload-pages-artifact` + `actions/deploy-pages`, and that path serves
the artifact verbatim — no Jekyll runs. Getting Jekyll includes back means
either reverting to branch-based publishing (losing the explicit,
reviewable, concurrency-guarded workflow the repo deliberately wrote, complete
with its comment about half-published artifacts) or adding
`actions/jekyll-build-pages` to `pages.yml`, at which point it is a build step
like any other and the "free" argument evaporates.

**Catch three: it would corrupt content today, with no opt-out.**
`site/getting-started.html` contains two literal GitHub Actions expressions in
code samples:

```
--bundle-id "github.com/${{ github.repository }}"
--channel ${{ github.ref_name == 'main' && 'latest' || github.ref_name }}
```

Liquid evaluates `{{ … }}`. Both samples would render with the braces' contents
silently blanked unless wrapped in `{% raw %}` — and unlike Eleventy (below),
Jekyll has no per-file "leave this HTML alone" switch, because a page needs
front matter to get a layout and front matter is what turns Liquid on. This is
not a theoretical escaping concern; it is two lines of currently-correct
documentation that would become wrong.

**Catch four:** the plugin set is a fixed allowlist of 47 gems, and the line is
Jekyll **3.x**, not 4 — older Liquid, `jekyll-sass-converter` 1.5.2, kramdown
2.4.0.

**Adopt cost:** `_config.yml`, `_layouts/default.html`, delete `.nojekyll`,
front matter on five pages, `{% raw %}` fences, and either a workflow rewrite
or a publishing-source change. **Maintain cost:** Ruby and Liquid become part
of the project's mental model for one 5-page site. **Verdict: no.**

### F. Eleventy 3.1.6

The obvious generator for content this shape, and the strongest of the
framework options by a distance. Current stable is **`@11ty/eleventy` 3.1.6**
(v4 is still alpha), Node `>=18`, and a measured install of **129 packages /
22 MB** — an order of magnitude lighter than anything else here.

A page becomes front matter plus its existing body, unchanged:

```njk
---
layout: base.njk
title: Architecture — Colophon
description: How a docs directory becomes a bundle…
page: architecture
---
<article class="doc">
  … the existing 22 KB of body, byte for byte …
</article>
```

and `_includes/base.njk` holds the head, header, footer and script once, with a
loop over a nav data file that emits `aria-current` and omits the current page
from the footer. `eleventy.config.mjs` is about fifteen lines, most of it
`addPassthroughCopy` for `assets/`.

**This is a genuinely good fit,** and better than it first looks. Eleventy
preprocesses `.html` files as Liquid by default — which would hit the same
`${{ github.repository }}` corruption Jekyll does — but a single config line,
`htmlTemplateEngine: false`, makes page bodies pass through **verbatim** while
layouts still apply. That is exactly the "share the chrome, don't touch my
HTML" mode this site needs, and it is the one thing no other option on this
list offers. (Two gotchas to note if this is chosen: the layout needs
`{{ content | safe }}`, not `{{ content }}`, or the body is HTML-escaped; and
editing anything in `_includes` forces a full rebuild even under
`--incremental`.)

The output is byte-comparable to what is served today. Zero client-side
JavaScript is added. The bespoke CSS, the inline SVG diagrams, the mock UI, the
container queries and the three-way theme toggle all survive untouched, because
Eleventy has no opinion about layout — it is a file transformer, not a theme.

**Adopt cost:** one devDependency and 129 packages in `yarn.lock`; move five
files into `site/src/` and strip their chrome (**−24,865 bytes, roughly
−600 lines**); write `_includes/base.njk` (~95 lines) and a nav data file; add
`site/_site` to `.gitignore` and to `biome.json`'s `files.includes` exclusions;
add a root `build:site` script; rewrite `pages.yml` to check out, set up Node,
enable corepack, `yarn install --immutable`, build, and upload `site/_site`.

**Maintain cost:** one edit per chrome change. Plus a dependency that needs
upgrading, a `--serve` dev server that is genuinely nicer than opening a file,
and a build that can fail.

**Deploy:** this is where the real cost is, and it is not the 22 MB.
`pages.yml` grows from 4 steps to ~7, and from a few seconds to minutes,
dominated by `yarn install --immutable` against a Backstage monorepo lockfile —
the Pages workflow currently installs nothing at all. More importantly it gains
a whole class of failure: the site deploy can now break because of a lockfile,
a Node version, or a devDependency that has nothing to do with the site.

**What it breaks:** `open site/index.html` stops working; previewing requires
`yarn build:site` or `npx eleventy --serve`. The deployed artifact is no longer
the thing in the repository, so "everything on this site is drawn from the
repository itself" (the footer's own claim) gets one more layer of indirection.
CI gains a failure mode the site never had.

### G. Astro 7.2.4

Astro is the same shape as Eleventy with more machinery. `.astro` files are an
HTML superset, so bodies paste in verbatim; a `Base.astro` layout takes
`title`, `description` and `page` as props; the static build emits plain HTML
with zero injected CSS and zero JavaScript by default. The "we are already a
TypeScript monorepo" argument is real, and props-with-types is a nicer contract
than Nunjucks variables.

**But it is 194 packages and 140 MB** — six times Eleventy's footprint, pulling
Vite 8, esbuild, Shiki and Zod — for five static pages with no components, no
islands, no data-fetching and no interactivity beyond a 71-line theme toggle.
Nothing in this site uses anything Astro is for.

Astro 7 also requires **Node `>=22.12.0`**, while this repo's `engines` field
says `22 || 24`. CI runs Node 24 and `.nvmrc` says 24, so nothing breaks today,
but the declared floor and the actual floor would no longer agree.

**And one concrete trap:** Astro processes `<script>` tags by default —
bundling them and emitting `type="module"`, which is deferred. The head script
in `site/*.html` exists *specifically* to run before the first paint, and its
comment says so. Migrating without `is:inline` on that tag reintroduces the
flash-of-wrong-theme the script was written to prevent, and it would be
invisible in review.

**Adopt cost:** larger than Eleventy's, same shape. **Maintain cost:** larger —
a Vite major every year or so. **Deploy:** same change as Eleventy, slower
build. **Verdict:** correct tool, wrong size. Choose it if the site ever grows
interactive components; not for this.

### H. Docs-oriented generators — Starlight, VitePress, Docusaurus

All three exist to give you a docs theme. This site already has a design, and
the design *is the product* — it is the shop window for a documentation plugin.

- **Starlight 0.41.7** (still pre-1.0) ships an opinionated sidebar/TOC/header
  shell with its own design tokens. Customisation is component overrides plus a
  `customCss` array — a fully bespoke design means overriding so many
  components that the theme has been rewritten. **364 packages, 221 MB**,
  because it also drags in Pagefind, Expressive Code, i18next, MDX and the
  whole unified/rehype stack.
- **VitePress 1.6.4** is the same bargain in Vue. Fully replacing the default
  theme is genuinely easy — `.vitepress/theme/index.js` exporting a `Layout` —
  but **that `Layout` must be a Vue 3 component rendering `<Content />`**. The
  theme cannot be plain HTML and CSS, which is precisely what this site is.
  125 packages, 99 MB, and the stable line is aging: it still uses **Vite 5**,
  two majors behind, with 2.0 in alpha since late 2025.
- **Docusaurus 3.10.2** is the heaviest by a wide margin — **~1,274 packages,
  245 MB**, roughly ten times Eleventy — with React 19 as a hard peer
  dependency, MDX, webpack 5 and React Router 5. Its value is versioned docs,
  i18n and search; this site wants none of them.

All three also assume Markdown source. The bodies here are hand-authored HTML
with 31 themed inline SVGs; they would live inside MDX as raw HTML blocks,
gaining nothing and losing the ability to be opened in a browser.

**Verdict: no, for all three.** They solve `docs/`, not `site/`.

### Accessibility, performance and the theme toggle, per option

The site's current baseline is unusually good and easy to lose by accident:
nav and content need no JavaScript; `aria-current="page"` is in the served
markup; the skip link's target exists before paint; there are zero external
requests and no web fonts; and the three-way theme is decided by a
render-blocking inline script so no frame is ever painted in the wrong palette.

| Option | No-JS nav | `aria-current` in markup | Theme toggle | Layout shift | Requests |
| --- | --- | --- | --- | --- | --- |
| A / B (as today) | yes | yes | unchanged | none | 2 (HTML + CSS) |
| B step one (`theme.js`) | yes | yes | unchanged, now cached across pages | none | 3, one of them cached |
| C hand-rolled build | yes | yes | unchanged | none | same as today |
| D runtime JS includes | **no** | **no** — computed after paint | unchanged | **yes, above the fold** | +1 or +2 fetches |
| E Jekyll | yes | yes | unchanged | none | same |
| F Eleventy | yes | yes | unchanged | none | same |
| G Astro | yes | yes | **at risk** — see below | none | same |
| H Starlight / VitePress / Docusaurus | yes | theme's own | **replaced** by the theme's | none | more |

The Astro caveat is specific and would be invisible in review: Astro processes
`<script>` tags by default, bundling them and emitting `type="module"`, which
is deferred. The head script exists precisely to run *before* the first paint —
its own comment says a deferred script "would run after the first frame, which
is the frame that would be wrong". Migrating without `is:inline` on that one
tag silently reintroduces the flash of wrong theme the script was written to
prevent.

The docs generators do not merely risk the toggle, they replace it: each ships
its own dark-mode implementation with its own storage key and its own two-state
(not three-state) model. The ability to hand control back to the operating
system — which is why the toggle has three states — is not something they
offer.

### The generators side by side

Package counts and disk are from clean `npm install` measurements taken for
this investigation, August 2026.

| Tool | Stable | Node | Packages | `node_modules` | Bodies survive verbatim? | `pages.yml` change |
| --- | --- | --- | ---: | ---: | --- | --- |
| Nothing (today) | — | — | 0 | 0 | n/a | none |
| Checker script (B) | — | any | 0 | 0 | yes | none |
| Hand-rolled generator (C2) | — | any | 0 | 0 | yes | none |
| posthtml + posthtml-include | 0.16.7 / 2.0.1 | any | 5 | ~1 MB | yes | build step |
| GitHub Pages Jekyll | 3.10.0 | n/a | 0 local | 0 | **no** — Liquid eats `${{ }}` | conflicts with `.nojekyll` |
| **Eleventy** | **3.1.6** | ≥18 | **129** | **22 MB** | **yes**, with `htmlTemplateEngine: false` | build step |
| Astro | 7.2.4 | ≥22.12 | 194 | 140 MB | yes | build step |
| Astro + Starlight | 0.41.7 | ≥22.12 | 364 | 221 MB | no — opinionated theme | build step |
| VitePress | 1.6.4 | — | 125 | 99 MB | no — theme must be Vue | build step |
| Docusaurus | 3.10.2 | ≥20 | ~1,274 | 245 MB | no — React + MDX | build step |

### On sharing a source with `docs/`

`docs/` is four Markdown files with Colophon front matter, published as a
Colophon bundle and dogfooded through the project's own CLI. It would be
technically possible for an SSG to render `docs/` into the site as well.

**Do not.** Three reasons:

1. **Different audiences.** `site/` argues why Colophon should exist;
   `docs/` explains how to configure it. The overlap is topical, not textual.
2. **It would create a second renderer for the dogfood.** The entire point of
   `docs/` being a Colophon bundle is that publishing it is how bad developer
   experience gets noticed — the README credits it with catching a dropped
   landing page and an unstable revision id. Rendering the same Markdown a
   second way, through Eleventy or VitePress, means two definitions of how a
   Colophon doc looks, and the one that is *not* the plugin is the one that
   would be seen most.
3. It is not a reason to adopt a generator. If it were desirable, it would be
   desirable on its own merits.

---

## 3. Recommendation

**Adopt option B: keep the five hand-written pages, extract the one block that
is genuinely identical, and add a zero-dependency drift check to `yarn verify`.
Do not adopt a static site generator.**

The reasoning, in order of weight:

**1. The measurement does not say what it looks like it says.** "18% duplicated
chrome" reads as an extraction problem. It is not. Three of the four repeated
regions are *deliberately per-page* — the title, the description, the
`aria-current` marker, the footer's self-omission. Only the trailing script is
truly duplicated, and that one needs no generator at all: it needs a `<script
src>`. Adopting Eleventy to deduplicate 24 KB of chrome that is not actually
duplicated is solving the wrong problem with the larger tool.

**2. The failure mode was drift, and a checker removes drift completely.** The
bug that motivated this was a footer link applied to three of five pages. A
generator prevents it by construction; a checker prevents it by failing CI. For
five pages the two are equally effective, and only one of them costs a
dependency tree, a rewritten Pages workflow, and the ability to open the file in
a browser.

**3. Five pages is under the threshold — and the cost that matters is the
deploy, not the dependency.** Eleventy's leverage scales with page count. At
five pages, per-chrome-change cost is five edits: call it ten minutes a year.

Be honest about the counter-argument here, because the obvious one is weak.
"129 packages is too many" does not really survive contact with a repository
that already installs the Backstage CLI; 22 MB is noise in this `node_modules`.
The README's restraint argument is real but it is about *conceptual* surface,
and Eleventy's conceptual surface is small.

The cost that does survive is the deploy. `pages.yml` today is checkout →
upload: four steps, no install, and it cannot fail for a reason that isn't
about the site. Under Eleventy it becomes checkout → setup-node → corepack →
`yarn install --immutable` → build → upload, which means the project site stops
publishing whenever the monorepo lockfile is unhappy. Trading a deploy that
cannot break for a saving of ten minutes a year is the wrong direction, and
`open site/index.html` no longer previewing the deployed artifact is thrown in
for free.

**4. The repository already has this pattern and it works.**
`scripts/check-packables.mjs` is a 6.3 KB zero-dependency `.mjs` script in
`scripts/` that refuses a bad release, with a comment block explaining the two
real incidents it exists to prevent. A `scripts/check-site-chrome.mjs` that
refuses a drifted nav, with a comment block explaining the footer-link
incident, is the same idea in the same register. It will read as native to this
codebase in a way that an `eleventy.config.mjs` will not.

**5. Nothing about the site's quality is at risk.** Option B changes zero bytes
of rendered output except for moving a script into a cacheable file. The
container queries, the three-way theme toggle, the inline SVG diagrams, the
render-blocking head script, the perfect no-JS baseline, the zero external
requests — all untouched, because nothing touches them.

### Runner-up: Eleventy

If this recommendation is rejected, take Eleventy, not Astro and not a docs
theme. It is the only framework option that preserves the design completely,
because it has no design of its own. Its case gets stronger the moment any of
these becomes true:

- the site passes roughly **ten pages**, where five-edits-per-change starts to
  hurt;
- a **blog, changelog or release-notes section** appears, which means a
  collection, which is exactly Eleventy's leverage;
- any page becomes **generated from repository data** (a config-key table from
  `app-config.yaml`, a version badge), which the checker cannot do and the
  generator does trivially.

None of those is true today.

### What is explicitly rejected

Runtime JavaScript includes (breaks the no-JS baseline and the a11y
affordances), Jekyll (would silently blank two code samples, and is not even
free under this deploy), Astro (right shape, wrong weight, plus a real
FOUC trap), and Starlight/VitePress/Docusaurus (would discard the design that
is the site's entire purpose).

---

## 4. If accepted, the first step

Do the smallest, most obviously-correct piece first, and do it alone.

**Step one — extract the theme toggle. One commit, no new tooling.**

Move the 71-line block that appears byte-for-byte identically at the end of all
five pages (`<script>` on line 449 of `index.html` through `</script>`) into
`site/assets/theme.js`, and replace each copy with:

```html
<script src="assets/theme.js" defer></script>
```

`defer` is correct and necessary here: the script queries
`[data-theme-toggle]`, so it must run after the header is parsed, which is
exactly what `defer` guarantees. The render-blocking script in `<head>` stays
exactly where it is — it must not move, and it is not duplicated logic, it is
the anti-FOUC guard.

- Diff: **+1 file (~69 lines), −350 lines across five pages** — roughly
  −12,150 bytes of HTML against +2,300 bytes of JavaScript.
- Removes the only genuinely byte-identical duplicate in the site.
- Makes the toggle a single cacheable file, so a reader visiting a second page
  downloads it zero times instead of once more.
- Zero new dependencies, zero workflow changes, zero risk. Verifiable by
  opening each page and clicking the toggle three times.

**Step two — add the checker.** `scripts/check-site-chrome.mjs`, appended to
`verify`. It should derive the page list from the directory rather than
hardcoding it, so a sixth page is protected the moment it is created, and it
should assert precisely the four invariants in §2B — including, after step one,
that no page has re-inlined the toggle.

**Step three — nothing.** Revisit only when one of the three Eleventy triggers
above fires.

---

## Sources

Version numbers, Node floors and dependency counts were checked in August 2026;
package counts and `node_modules` sizes come from clean `npm install`
measurements made for this document.

- Eleventy releases and dist-tags — <https://registry.npmjs.org/@11ty/eleventy>
- Eleventy, HTML template engine and `htmlTemplateEngine: false` —
  <https://www.11ty.dev/docs/languages/html/>
- Eleventy layouts and `_includes` — <https://www.11ty.dev/docs/layouts/>
- Eleventy incremental builds — <https://www.11ty.dev/docs/usage/incremental/>
- Eleventy watch and serve — <https://www.11ty.dev/docs/watch-serve/>
- Astro releases, Node floor and Vite dependency —
  <https://registry.npmjs.org/astro>
- Starlight customisation and component overrides —
  <https://starlight.astro.build/guides/customization/>
- VitePress custom themes (the `Layout` Vue-component contract) —
  <https://vitepress.dev/guide/custom-theme>
- GitHub Pages dependency versions (Jekyll 3.10.0, `github-pages` 232, Ruby
  3.3.4, plugin allowlist) — <https://pages.github.com/versions.json>
- GitHub Pages and Jekyll —
  <https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll>
- `.nojekyll` disables Jekyll processing entirely —
  <https://github.blog/news-insights/bypassing-jekyll-on-github-pages/>
- HTML Imports, Discontinued Draft —
  <https://www.w3.org/TR/2023/DISC-html-imports-20230615>
- Declarative Shadow DOM, Baseline widely available 2026-08-20 —
  <https://web-platform-dx.github.io/web-features-explorer/features/declarative-shadow-dom/>
- WHATWG proposal for declarative HTML partial inclusions, opened 2026-08-02,
  `needs implementer interest` — <https://github.com/whatwg/html/issues/12747>
- `<frame>` deprecation and nested-browsing-context accessibility problems —
  <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/frame>
