import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scan } from './scan';

/** Fixtures live under the repo's tmp/, never the system temp directory. */
const TMP_ROOT = join(__dirname, '../../../tmp');

describe('scan', () => {
  const made: string[] = [];
  afterEach(async () => {
    await Promise.all(
      made.splice(0).map(path => rm(path, { recursive: true, force: true })),
    );
  });

  async function fixture(files: Record<string, string> = {}) {
    await mkdir(TMP_ROOT, { recursive: true });
    const created = await mkdtemp(join(TMP_ROOT, 'scan-'));
    made.push(created);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(created, path, '..'), { recursive: true });
      await writeFile(join(created, path), content);
    }
    return created;
  }

  it('rejects a directory that does not exist', async () => {
    // fast-glob returns [] for a missing cwd rather than throwing, so a
    // mistyped path would otherwise publish an empty bundle over a real one
    // and read as the documentation having been deleted.
    await expect(scan(join(TMP_ROOT, 'definitely-not-here'))).rejects.toThrow(
      /does not exist/,
    );
  });

  it('rejects a path that is a file', async () => {
    const created = await fixture({ 'index.md': '# H' });
    await expect(scan(join(created, 'index.md'))).rejects.toThrow(
      /not a directory/,
    );
  });

  it('accepts a directory that exists but is empty', async () => {
    // Distinct from missing on purpose: the validator reports this with a
    // message about the docs directory and exclude patterns, which is more
    // useful than a scan failure.
    expect((await scan(await fixture())).pages).toEqual([]);
  });

  it('separates markdown pages from assets', async () => {
    const result = await scan(
      await fixture({
        'index.md': '---\ntitle: Home\n---\n\n# Home\n',
        '_assets/logo.png': 'not really a png',
      }),
    );
    expect(result.pages.map(page => page.slug)).toEqual(['']);
    expect(result.assets.map(asset => asset.path)).toEqual([
      '_assets/logo.png',
    ]);
  });

  it('reads frontmatter without gray-matter, via the shared splitter', () => {
    return fixture({
      'a.md':
        '---\ntitle: Explicit\ndescription: D\ntags: [x]\n---\n\n# Other\n',
    })
      .then(scan)
      .then(result => {
        const [page] = result.pages;
        expect(page.title).toBe('Explicit');
        expect(page.description).toBe('D');
        expect(page.tags).toEqual(['x']);
        expect(page.body.trimStart()).toBe('# Other\n');
      });
  });

  it('falls back from frontmatter to the first h1 to the filename', async () => {
    const result = await scan(
      await fixture({
        'from-h1.md': '# From Heading\n\nbody\n',
        'from-file-name.md': 'no heading here\n',
      }),
    );
    const titles = Object.fromEntries(
      result.pages.map(page => [page.path, page.title]),
    );
    expect(titles['from-h1.md']).toBe('From Heading');
    expect(titles['from-file-name.md']).toBe('From File Name');
  });

  it('ignores a malformed frontmatter block rather than failing the scan', async () => {
    // One bad page should degrade to "no metadata", so the validator can say
    // which page is at fault instead of the publish dying earlier.
    const result = await scan(
      await fixture({ 'a.md': '---\n: : :\n---\n\n# Title\n' }),
    );
    expect(result.pages[0].title).toBe('Title');
  });
});
