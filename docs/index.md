---
title: Colophon
description: Markdown documentation for the Backstage software catalog, rendered for humans and exposed as MCP tools for agents.
type: explanation
tags: [overview]
---

# Colophon

Colophon publishes a repository's `docs/` tree as Markdown and serves it two
ways from one source of truth: rendered in Backstage for people, and exposed
as MCP tools for coding agents.

This documentation is itself a Colophon bundle. We publish it with our own
CLI, which is the fastest way to notice when the developer experience is bad.

## Where to start

- [Architecture](architecture.md) — why the pipeline is shaped this way
- [Publishing](guides/publishing.md) — getting a repository's docs into Backstage
- [Writing docs](guides/writing-docs.md) — conventions, frontmatter, and what agents need
- [Customising rendering](guides/customising-rendering.md) — override slots, brand tokens, and the limits
- [CLI reference](reference/cli.md) — publishing, retiring, and collecting garbage
- [Configuration](reference/configuration.md) — every app-config key
