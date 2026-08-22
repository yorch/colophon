# Changesets

A changeset is a note describing a change and how it should bump the version.
Add one to any pull request that touches a published package:

```bash
yarn changeset
```

It asks which packages changed and whether the change is a patch, minor or
major, then writes a markdown file here. That file is the source for both the
version bump and the changelog entry, and it is reviewed like any other part of
the pull request — which is the point. A commit message is written for the
person reading `git log`; a changeset is written for the person deciding
whether to upgrade.

The five published packages are a **fixed** group: they version and release
together. They are one system with one contract, so a release where
`colophon-common` moved and the plugins did not would be a version combination
nobody has run. The cost is that a package with no changes still gets a bump,
which is the cheaper mistake.

`dev-app/*` is private and never published, so it needs no changeset.
