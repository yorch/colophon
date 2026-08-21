import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, upload } from './publish';
import { LocalBundleStorage } from './storage';

/** Fixtures live under the repo's tmp/, never the system temp directory. */
const TMP_ROOT = join(__dirname, '../../../tmp');

async function fixture(files: Record<string, string>): Promise<string> {
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, 'publish-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

const SOURCE = {
  url: 'https://example.com/repo',
  ref: 'main',
  commit: 'abc123',
};
const FIXED_NOW = () => new Date('2026-08-21T12:00:00.000Z');

const DOCS = {
  'index.md': '---\ntitle: Home\ndescription: Landing.\n---\n\n# Home\n\nHi.\n',
  'guides/deploy.md':
    '---\ntitle: Deploy\ndescription: How to deploy.\n---\n\n# Deploy\n\n## Steps\n\nDo it.\n',
};

describe('build', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('produces a manifest that validates against the shared contract', async () => {
    dir = await fixture(DOCS);
    const { manifest } = await build({
      docsDir: dir,
      bundleId: 'example.com/repo',
      source: SOURCE,
      now: FIXED_NOW,
    });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.pages.map(p => p.slug).sort()).toEqual([
      '',
      'guides/deploy',
    ]);
    expect(manifest.revisionId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('derives the bundle title from the landing page', async () => {
    dir = await fixture(DOCS);
    const { manifest } = await build({
      docsDir: dir,
      bundleId: 'example.com/repo',
      source: SOURCE,
      now: FIXED_NOW,
    });
    expect(manifest.title).toBe('Home');
  });

  it('extracts headings with anchors for deep linking', async () => {
    dir = await fixture(DOCS);
    const { manifest } = await build({
      docsDir: dir,
      bundleId: 'example.com/repo',
      source: SOURCE,
      now: FIXED_NOW,
    });
    const deploy = manifest.pages.find(p => p.slug === 'guides/deploy');
    expect(deploy?.headings).toEqual([
      { depth: 1, text: 'Deploy', anchor: 'deploy' },
      { depth: 2, text: 'Steps', anchor: 'steps' },
    ]);
  });
});

describe('revision identity', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map(d => rm(d, { recursive: true, force: true })),
    );
  });

  async function revisionFor(
    overrides: Parameters<typeof build>[0] extends never
      ? never
      : Partial<Parameters<typeof build>[0]> = {},
  ) {
    const dir = await fixture(DOCS);
    dirs.push(dir);
    const { manifest } = await build({
      docsDir: dir,
      bundleId: 'example.com/repo',
      source: SOURCE,
      now: FIXED_NOW,
      ...overrides,
    });
    return manifest.revisionId;
  }

  it('is stable across runs, so a retried pipeline does not grow history', async () => {
    expect(await revisionFor()).toBe(await revisionFor());
  });

  it('ignores the publish timestamp, which describes the run not the docs', async () => {
    // This is the whole point of content-addressing; including createdAt made
    // every re-run of the same commit mint a new revision.
    const a = await revisionFor({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    const b = await revisionFor({
      now: () => new Date('2026-12-31T23:59:59.000Z'),
    });
    expect(a).toBe(b);
  });

  it('ignores publisher metadata such as the CI run URL', async () => {
    const a = await revisionFor({
      publisher: { name: 'ci', runUrl: 'https://ci/1' },
    });
    const b = await revisionFor({
      publisher: { name: 'ci', runUrl: 'https://ci/2' },
    });
    expect(a).toBe(b);
  });

  it('changes when the source commit changes', async () => {
    const a = await revisionFor();
    const b = await revisionFor({ source: { ...SOURCE, commit: 'def456' } });
    expect(a).not.toBe(b);
  });

  it('changes when the content changes', async () => {
    const dir = await fixture({
      ...DOCS,
      'index.md': '---\ntitle: Home\n---\n\nDifferent.\n',
    });
    dirs.push(dir);
    const { manifest } = await build({
      docsDir: dir,
      bundleId: 'example.com/repo',
      source: SOURCE,
      now: FIXED_NOW,
    });
    expect(manifest.revisionId).not.toBe(await revisionFor());
  });
});

describe('upload', () => {
  let dir: string;
  let store: string;
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  });

  it('skips blobs already present, which is what makes history affordable', async () => {
    dir = await fixture(DOCS);
    store = await mkdtemp(join(TMP_ROOT, 'store-'));
    const storage = new LocalBundleStorage(store);
    const built = await build({
      docsDir: dir,
      bundleId: 'example.com/repo',
      source: SOURCE,
      now: FIXED_NOW,
    });

    const first = await upload({ ...built, storage });
    expect(first.blobsUploaded).toBe(2);
    expect(first.blobsSkipped).toBe(0);

    const second = await upload({ ...built, storage });
    expect(second.blobsUploaded).toBe(0);
    expect(second.blobsSkipped).toBe(2);
  });

  it('writes a manifest that can be read straight back', async () => {
    dir = await fixture(DOCS);
    store = await mkdtemp(join(TMP_ROOT, 'store-'));
    const storage = new LocalBundleStorage(store);
    const built = await build({
      docsDir: dir,
      bundleId: 'example.com/repo',
      source: SOURCE,
      now: FIXED_NOW,
    });
    await upload({ ...built, storage });

    const key = `bundles/example.com/repo/revisions/${built.manifest.revisionId}/manifest.json`;
    expect(JSON.parse((await storage.get(key)).toString('utf8'))).toEqual(
      built.manifest,
    );
  });
});
