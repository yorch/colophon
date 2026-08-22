#!/usr/bin/env node
/**
 * Refuses to publish a package that would ship nothing or carry the
 * placeholder version, and leaves no half-packed manifests behind if it fails.
 *
 * `npm publish` does not care whether a tarball has any files in it. A
 * workspace whose `dist/` was never built packs down to a single
 * package.json, publishes successfully, and the only symptom is that every
 * consumer's import fails — after the version number is burned, because npm
 * does not allow republishing one.
 *
 * That is not hypothetical: packing this repository on a clean checkout
 * produces exactly that, since `dist/` is gitignored and `prepack` needs
 * type declarations that only `yarn tsc` emits. Ordering the release steps
 * correctly fixes it today; this fails loudly if anyone reorders them later.
 *
 * The version check exists for the same reason, from the same accident.
 * `0.0.0` is what these manifests hold when no release has happened yet, and
 * a release run that never picked up the version bump publishes exactly that
 * — five packages at 0.0.0, which npm then also points `latest` at, because
 * the first publish of a package always sets it whatever `--tag` says. That
 * happened. Undoing it needed an unpublish inside npm's 72-hour window.
 *
 * Note what is deliberately NOT checked: whether the version is already on
 * the registry. `changeset publish` skips versions it finds there, and two
 * things depend on that — the no-op release run after a local publish, and
 * re-running a release that failed partway through its packages.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

/**
 * Puts back a manifest that `prepack` rewrote and `postpack` never restored.
 *
 * Packing runs `backstage-cli package prepack`, which points `main` and
 * `types` at `dist/` and saves the original as `package.json-prepack`.
 * `postpack` swaps it back — but only if the pack reaches the end. A pack
 * that fails partway leaves the rewritten manifest in the working tree, and
 * committing that would point the repository's own entrypoints at build
 * output that is gitignored, breaking `yarn start` and the test suite for
 * everyone.
 *
 * This runs locally as part of `yarn release`, so the working tree it damages
 * is a maintainer's, on the day they are trying to publish.
 */
function restoreManifest(location) {
  const backup = `${location}/package.json-prepack`;
  if (!existsSync(backup)) {
    return false;
  }
  renameSync(backup, `${location}/package.json`);
  return true;
}

const workspaces = JSON.parse(
  `[${execFileSync('yarn', ['workspaces', 'list', '--json'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .join(',')}]`,
);

const publishable = workspaces
  .filter(({ location }) => location !== '.')
  .map(({ location, name }) => ({
    location,
    name,
    manifest: JSON.parse(
      execFileSync(
        'node',
        ['-p', `JSON.stringify(require('./${location}/package.json'))`],
        { encoding: 'utf8' },
      ),
    ),
  }))
  .filter(({ manifest }) => !manifest.private);

// An earlier run that died — or a cancelled publish — can leave one behind,
// in which case the manifest read above is the rewritten one. Clear them
// before measuring anything.
for (const { location, name } of publishable) {
  if (restoreManifest(location)) {
    process.stdout.write(
      `  restored ${name} from an earlier interrupted pack\n`,
    );
  }
}

/** What the manifests hold before any release has been made. */
const PLACEHOLDER_VERSION = '0.0.0';

const failures = [];

const placeholders = publishable.filter(
  ({ manifest }) => manifest.version === PLACEHOLDER_VERSION,
);
if (placeholders.length > 0) {
  process.stderr.write(
    `\nRefusing to publish at ${PLACEHOLDER_VERSION}:\n` +
      `${placeholders.map(({ name }) => `  - ${name}`).join('\n')}\n\n` +
      'That is the placeholder these manifests carry until a release bumps\n' +
      'them, so the version bump has not been applied to this working tree.\n' +
      'Run `yarn version-packages`, or take the version commit the release\n' +
      'workflow prepared, and check the version before publishing again — npm\n' +
      'will not let the number be reused.\n',
  );
  process.exit(1);
}

for (const { location, name, manifest } of publishable) {
  let output;
  try {
    output = execFileSync('yarn', ['pack', '--dry-run', '--json'], {
      cwd: location,
      encoding: 'utf8',
    });
  } catch (error) {
    // Report and keep going: one package failing to pack should not hide
    // whether the others would have, and should not skip the restore below.
    failures.push(`${name} could not be packed — ${firstError(error)}`);
    continue;
  } finally {
    if (restoreManifest(location)) {
      process.stderr.write(`  restored ${name} after an interrupted pack\n`);
    }
  }

  const entries = output
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
    .filter(line => typeof line.location === 'string')
    .map(line => line.location);

  const shipped = entries.filter(entry => entry.startsWith('dist/'));
  if (shipped.length === 0) {
    failures.push(
      `${name} would publish ${entries.length} file(s) and nothing under dist/`,
    );
  } else {
    // The version is printed because it is the thing a human is meant to
    // recognise as wrong, and it was invisible here when it mattered.
    process.stdout.write(
      `  ${name}@${manifest.version}: ${shipped.length} files under dist/\n`,
    );
  }
}

/** Yarn reports failures as JSON lines; the first one is the useful one. */
function firstError(error) {
  const lines = String(error.stdout ?? '')
    .trim()
    .split('\n');
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'error' && parsed.data) {
        return parsed.data;
      }
    } catch {
      // Not JSON; fall through to the generic message below.
    }
  }
  return error.message;
}

if (failures.length > 0) {
  process.stderr.write(
    `\nRefusing to publish:\n${failures.map(f => `  - ${f}`).join('\n')}\n\n` +
      'Run `yarn tsc && yarn build` first: prepack rewrites the entrypoints to\n' +
      'dist/, and tsc is what emits the declarations it needs.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `${publishable.length} publishable packages have build output.\n`,
);
