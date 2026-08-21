---
title: Writing documentation
description: Conventions for the docs directory, frontmatter fields, and what makes documentation retrievable by agents.
type: how-to
tags: [authoring, conventions]
---

# Writing documentation

## Layout

```
docs/
  index.md          required, the entry point
  **/*.md           nesting is fine
  _assets/          images and attachments
  docs.yaml         optional: explicit nav and overrides
```

Navigation is derived from the directory tree unless `docs.yaml` provides an
explicit `nav`. Requiring a nav file is the biggest onboarding tax in MkDocs,
so it stays optional.

## Frontmatter

```yaml
---
title: Rotating database credentials
description: One sentence describing what this page answers.
type: how-to          # tutorial | how-to | reference | explanation
tags: [database, security]
status: current       # current | draft | deprecated
---
```

Only `title` is strictly required, and even that falls back to the first H1.

## Two fields that carry more weight than they look

**`description`** is what an agent sees in a search result before deciding
whether to fetch the whole page. A weak description means the agent fetches
everything and burns its context. `colophon publish --strict` makes a missing
description a build failure.

**`type`** uses the [Diátaxis](https://diataxis.fr) categories. It groups the
UI, lets agents filter for the right kind of page, and nudges you toward one
purpose per page — which is what makes sections self-contained.

## Write sections that survive being read alone

Retrieval cuts pages into chunks at H2 and H3. Every section is retrieved
without its neighbours, so:

- Say "OAuth 2.0 authentication", not "the authentication method above".
- Avoid pronouns that point at the previous section.
- Keep one complete thought under each heading.

This matters more to retrieval quality than any ranking algorithm. A
well-chunked corpus with plain full-text search beats a badly-chunked one with
state-of-the-art embeddings, because a chunk that does not stand alone is
useless no matter how well it was retrieved.

## Diagrams

Fenced `mermaid` blocks render as diagrams, in both light and dark themes.

````markdown
```mermaid
flowchart LR
  A[Request] --> B{Cached?}
  B -->|yes| C[Return]
  B -->|no| D[Fetch]
```
````
