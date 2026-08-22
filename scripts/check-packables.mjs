#!/usr/bin/env node
/**
 * Refuses to publish a package that would ship nothing.
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
 */
import { execFileSync } from 'node:child_process';

const workspaces = JSON.parse(
  `[${execFileSync('yarn', ['workspaces', 'list', '--json'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .join(',')}]`,
);

const failures = [];
let checked = 0;

for (const { location, name } of workspaces) {
  if (location === '.') {
    continue;
  }
  const manifest = JSON.parse(
    execFileSync(
      'node',
      ['-p', `JSON.stringify(require('./${location}/package.json'))`],
      {
        encoding: 'utf8',
      },
    ),
  );
  if (manifest.private) {
    continue;
  }

  const entries = execFileSync('yarn', ['pack', '--dry-run', '--json'], {
    cwd: location,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
    .filter(line => typeof line.location === 'string')
    .map(line => line.location);

  const shipped = entries.filter(entry => entry.startsWith('dist/'));
  checked += 1;
  if (shipped.length === 0) {
    failures.push(
      `${name} would publish ${entries.length} file(s) and nothing under dist/`,
    );
  } else {
    process.stdout.write(`  ${name}: ${shipped.length} files under dist/\n`);
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `\nRefusing to publish:\n${failures.map(f => `  - ${f}`).join('\n')}\n\n` +
      'Run `yarn tsc && yarn build` first: prepack rewrites the entrypoints to\n' +
      'dist/, and tsc is what emits the declarations it needs.\n',
  );
  process.exit(1);
}

process.stdout.write(`${checked} publishable packages have build output.\n`);
