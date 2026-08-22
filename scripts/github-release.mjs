#!/usr/bin/env node
/**
 * Creates one GitHub release for a version, not one per package.
 *
 * The five packages are a fixed group sharing a single version, so the
 * changesets action's default — a tag and a release per package — would
 * produce five near-identical entries per version and nothing to link to when
 * someone asks what is in 0.1.0.
 *
 * Runs after `changesets/action` with `createGithubReleases: false`. That flag
 * also stops the action pushing tags at all (in its source, `pushTag` sits
 * inside the `createGithubReleases` branch), so pushing the one tag we do want
 * is this script's job rather than an extra thing it happens to do.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const published = JSON.parse(process.env.PUBLISHED_PACKAGES ?? '[]');
if (published.length === 0) {
  process.stdout.write('Nothing was published; no release to create.\n');
  process.exit(0);
}

// The whole premise is that these move together. If that ever stops being
// true, one of these versions would be picked arbitrarily to name the tag —
// so fail instead, loudly, with the actual versions in the message.
const versions = [...new Set(published.map(p => p.version))];
if (versions.length > 1) {
  process.stderr.write(
    `Expected one version across the fixed group, got:\n${published
      .map(p => `  ${p.name}@${p.version}`)
      .join('\n')}\n\nCheck the "fixed" group in .changeset/config.json.\n`,
  );
  process.exit(1);
}

const version = versions[0];
const tag = `v${version}`;

/** The section of a changelog for one version, without its heading. */
function changelogSection(path) {
  let body;
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    return '';
  }
  // Changesets writes `## 0.1.0` per version; take up to the next `## `.
  const start = body.indexOf(`\n## ${version}\n`);
  if (start === -1) {
    return '';
  }
  const rest = body.slice(start + `\n## ${version}\n`.length);
  const end = rest.indexOf('\n## ');
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

// Every package in a fixed group shares the same changesets, so their entries
// are the same notes repeated. One is the release notes; the rest would be
// duplication.
const notes = changelogSection('packages/colophon-common/CHANGELOG.md');

const packageList = published
  .map(
    p =>
      `- \`${p.name}@${p.version}\` — https://www.npmjs.com/package/${p.name}/v/${p.version}`,
  )
  .join('\n');

const body = [notes, '', '### Packages', '', packageList].join('\n').trim();

execFileSync('git', ['tag', '-a', tag, '-m', tag], { stdio: 'inherit' });
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' });
execFileSync(
  'gh',
  ['release', 'create', tag, '--title', tag, '--notes', body],
  { stdio: 'inherit' },
);
process.stdout.write(`Created ${tag} covering ${published.length} packages.\n`);
