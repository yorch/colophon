/**
 * Publishes this repository's own documentation into the local harness.
 *
 * Dogfooding rather than a fixture: a checked-in bundle would drift from the
 * publisher that produced it, and the first thing worth verifying about the
 * portal is that real output from the real CLI renders. Pointing it at
 * `docs/` also means every documentation edit shows up in the app on the
 * next seed.
 *
 * Publishing is deliberately two steps — blobs to storage, then a small HTTP
 * call telling the backend a revision exists — so that a backend outage costs
 * a retry rather than a re-upload. That is why this needs the app running:
 * uploading alone leaves a bundle the backend has never heard of, which is
 * exactly what the first version of this script produced.
 *
 * Uses the CLI's own `main` rather than the `colophon` binary, because that
 * binary loads `dist/` and would need a build and a prepack first. Importing
 * `main` resolves to TypeScript source, so this works on a fresh clone.
 */
import { resolve } from 'node:path';
import { main } from '@brnby/colophon-cli';

// Anchored to this file rather than to cwd, so the seed writes where the
// backend reads no matter where it is invoked from.
const REPO_ROOT = resolve(__dirname, '../../..');
const BACKEND_URL = 'http://localhost:7007';
const BUNDLE_ID = 'github.com/yorch/colophon';

async function guestToken(): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/api/auth/guest/refresh`).catch(
    () => undefined,
  );
  if (!response?.ok) {
    throw new Error(
      `Could not reach the backend at ${BACKEND_URL}. Run "yarn start" first, ` +
        'then seed in a second terminal — registering a revision is an HTTP ' +
        'call to the running backend.',
    );
  }
  const body = (await response.json()) as {
    backstageIdentity?: { token?: string };
  };
  const token = body.backstageIdentity?.token;
  if (!token) {
    throw new Error('Guest sign-in returned no token');
  }
  return token;
}

async function seed(): Promise<number> {
  const token = await guestToken();
  return main([
    'publish',
    resolve(REPO_ROOT, 'docs'),
    '--bundle-id',
    BUNDLE_ID,
    '--storage',
    'local',
    '--local-dir',
    resolve(REPO_ROOT, 'colophon-data'),
    '--backend-url',
    BACKEND_URL,
    '--token',
    token,
    '--source-url',
    'https://github.com/yorch/colophon',
    '--source-ref',
    'main',
    '--source-commit',
    'development',
    '--publisher',
    'dev-app seed',
  ]);
}

seed().then(
  code => process.exit(code),
  error => {
    // eslint-disable-next-line no-console
    console.error(`\n${error.message}\n`);
    process.exit(1);
  },
);
