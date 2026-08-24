---
'@brnby/colophon-common': minor
'@brnby/colophon-cli': minor
'@brnby/plugin-colophon': minor
'@brnby/plugin-colophon-react': minor
'@brnby/plugin-colophon-backend': minor
---

Source links on every page, custom frontmatter carried through to agents, and
a configurable catalog annotation.

**A rendered page now offers "View source" and "Edit this page".** The
provenance was already in the manifest — `--source-url`, `--source-ref`,
`--source-path` have been recorded since the beginning — and
`ColophonPageHeader` already had an `editUrl` prop. Nothing computed one, so
a reader had no way back to the Markdown behind the page.

The URL is built through Backstage's `ScmIntegrationRegistry`, the same
component the catalog uses, rather than by assembling a GitHub path. `byUrl`
decides whether the host is one this portal integrates with, `resolveUrl`
joins the page's path onto the docs root, and `resolveEditUrl` produces that
provider's edit URL — so a self-hosted GitLab gets `/-/edit/` and GitHub
Enterprise gets `/edit/` without either being named anywhere. GitHub, GitLab,
Gitea and Bitbucket Cloud are covered.

Both links are **absent, not broken**, whenever any of that is missing: a
bundle published without `--source-*`, a host with no configured integration,
or a provider whose URL shape is not known. That is the state every existing
bundle is in until its next publish, so it had to be the quiet one. "View
source" is offered alongside "Edit this page" rather than instead of it
because several providers have no edit mode and return the view URL
unchanged; the header renders one link, not two identical ones, when they
match. `ColophonPageHeader` takes `sourceUrl` as a new optional prop.

**Custom frontmatter survives publishing.** Keys Colophon does not define —
`owner`, `reviewed`, `jira`, whatever an organisation uses — were parsed and
then dropped. They now travel on the page's new `metadata` field, all the way
from the publisher to `colophon:get-page`, so an agent asked "who owns this
page" can answer. Values keep their YAML shape: nested maps stay nested and
lists stay lists.

This is a **passthrough and nothing more**. Custom keys are not indexed and
cannot be searched or filtered on; querying them is a separate feature with
its own design. They ride on `colophon:get-page` only — `colophon:list-pages`
stays a cheap index, so an agent answering "which pages does platform own?"
reads the pages it cares about rather than getting the whole corpus's
metadata in one response.

*What an adopter sees:* it depends on whether their pages already carry keys
outside `title`, `description`, `type`, `status`, `tags`, `nav_order`.

- **No custom keys anywhere:** nothing changes at all. `metadata` is omitted
  rather than defaulted to `{}`, and `canonicalize` drops `undefined`, so
  re-publishing unchanged documentation produces the **same revision id** as
  before — verified by publishing one fixture with both the old and the new
  publisher and getting the same hash.
- **Already using `owner:` / `reviewed:` / anything else:** the next publish
  produces a **new revision id for byte-identical documentation**, because
  content that used to be discarded is now recorded. That is correct — the
  manifest genuinely describes more than it did — but it means one extra
  revision lands in the retention window on upgrade, and a pipeline asserting
  that an unchanged commit republishes to the same revision will see it move
  once.

*What an older deployment sees:* the field is additive in both directions, so
the two halves can be upgraded independently. A backend running the previous
schema parses a newer bundle with an object schema that does not declare
`metadata`, and zod strips undeclared keys — it reads the revision correctly
and simply never sees the field. A backend running this version reads an
older bundle and finds the key absent, which is exactly the "no custom keys"
case. `schemaVersion` therefore stays at `1`, because neither direction
errors. The backend gains a migration adding a nullable `metadata` column to
`colophon_pages`; rows written before it read back as "no custom keys", which
is the truth for them.

**`colophon.annotation` makes the catalog annotation configurable**, defaulting
to `brnby.io/colophon`. An organisation that namespaces its annotations no
longer has to rename them across its whole catalog to adopt the plugin. The
backend reads it when indexing entity links, and the frontend reads it — hence
`@visibility frontend` — because the documentation tab has to look up the same
key that was indexed.

One thing has to move with it: the predicate deciding whether the tab appears
at all is an `EntityContentBlueprint` filter, which the frontend system
evaluates without access to config. Rename the annotation and override the
filter together, or the tab keeps testing for the old key and an annotated
entity silently gets no tab. Both are documented in
`docs/reference/configuration.md`.
