---
---

Drop the removed `next` dist-tag from the project site's install instructions.

The `next` tag no longer exists on any of the five packages, so every install
command on the site failed with `404 No match found for version next`. The
commands are now untagged, which resolves to the current release and cannot rot
the same way; `getting-started.html` also stopped claiming nothing had been
published to a registry.

Site content only — `site/` is not part of any published package, so this
changeset is deliberately empty.
