import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  blobKey,
  MANIFEST_SCHEMA_VERSION,
  type Manifest,
  manifestKey,
  type RetainedRevision,
} from '@brnby/colophon-common';
import { executeGc, type GcPlan, planGc } from './gc';
import { type BundleStorage, LocalBundleStorage } from './storage';

/** Fixtures live under the repo's tmp/, never the system temp directory. */
const TMP_ROOT = join(__dirname, '../../../tmp');

const sha256 = (input: string) =>
  createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');

const revisionOf = (label: string) => sha256(`revision:${label}`);

/** Every rule here is about content that two bundles share, so name it. */
const SHARED = '# MIT License\n\nCopyright (c) the same words in both repos.\n';

describe('gc', () => {
  let dir: string;
  // Typed as the interface so the tests exercise the contract every backend
  // must satisfy, not one class's narrower signature.
  let storage: BundleStorage;

  beforeEach(async () => {
    await mkdir(TMP_ROOT, { recursive: true });
    dir = await mkdtemp(join(TMP_ROOT, 'gc-'));
    storage = new LocalBundleStorage(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Writes blobs and a manifest exactly as `colophon publish` would. */
  async function publish(options: {
    bundleId: string;
    label: string;
    bodies: string[];
  }): Promise<{ revisionId: string; blobs: string[] }> {
    const revisionId = revisionOf(options.label);
    const manifest: Manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      bundleId: options.bundleId,
      revisionId,
      createdAt: '2026-08-21T00:00:00.000Z',
      source: {
        type: 'git',
        url: `https://${options.bundleId}`,
        ref: 'main',
        commit: 'c'.repeat(40),
        path: 'docs',
      },
      title: options.bundleId,
      pages: options.bodies.map((body, index) => ({
        path: index === 0 ? 'index.md' : `page-${index}.md`,
        slug: index === 0 ? '' : `page-${index}`,
        title: `Page ${index}`,
        status: 'current',
        tags: [],
        headings: [],
        contentHash: sha256(body),
        size: Buffer.byteLength(body),
      })),
      nav: [],
      assets: [],
    };

    for (const body of options.bodies) {
      await storage.put(
        blobKey(sha256(body)),
        Buffer.from(body, 'utf8'),
        'text/markdown',
      );
    }
    await storage.put(
      manifestKey(options.bundleId, revisionId),
      Buffer.from(JSON.stringify(manifest), 'utf8'),
      'application/json',
    );
    return {
      revisionId,
      blobs: options.bodies.map(body => blobKey(sha256(body))),
    };
  }

  const sweep = (retained: RetainedRevision[], minAgeMs = 0) =>
    planGc({ storage, retained: async () => retained, minAgeMs });

  const run = async (retained: RetainedRevision[]): Promise<GcPlan> => {
    const plan = await sweep(retained);
    await executeGc({ storage, plan });
    return plan;
  };

  describe('a blob two bundles share', () => {
    /**
     * The case this whole module exists to get right.
     *
     * Blobs live in one flat, content-addressed namespace, so the identical
     * LICENSE in two repositories is ONE object. Reachability computed per
     * bundle would decide, correctly for that bundle and catastrophically for
     * the other, that nobody needs it.
     */
    let alpha: { revisionId: string; blobs: string[] };
    let beta: { revisionId: string; blobs: string[] };

    beforeEach(async () => {
      alpha = await publish({
        bundleId: 'github.com/org/alpha',
        label: 'alpha',
        bodies: [SHARED, '# Alpha\n\nOnly alpha has this page.\n'],
      });
      beta = await publish({
        bundleId: 'github.com/org/beta',
        label: 'beta',
        bodies: [SHARED, '# Beta\n\nOnly beta has this page.\n'],
      });
      // The premise: one object, two bundles.
      expect(alpha.blobs[0]).toBe(beta.blobs[0]);
      expect(await storage.list('blobs/')).toHaveLength(3);
    });

    it('survives deleting the first bundle, because the second still needs it', async () => {
      const plan = await run([
        { bundleId: 'github.com/org/beta', revisionId: beta.revisionId },
      ]);

      expect(await storage.has(alpha.blobs[0])).toBe(true);
      expect(await storage.has(beta.blobs[1])).toBe(true);
      // Alpha's own page and its manifest are collected.
      expect(await storage.has(alpha.blobs[1])).toBe(false);
      expect(
        await storage.has(
          manifestKey('github.com/org/alpha', alpha.revisionId),
        ),
      ).toBe(false);
      expect(plan.unreferencedBlobs).toHaveLength(1);
      expect(plan.staleManifests).toHaveLength(1);
    });

    it('is collected once the second bundle goes too', async () => {
      await run([
        { bundleId: 'github.com/org/beta', revisionId: beta.revisionId },
      ]);
      await run([]);

      expect(await storage.has(alpha.blobs[0])).toBe(false);
      expect(await storage.has(beta.blobs[1])).toBe(false);
      expect(await storage.list('blobs/')).toEqual([]);
    });

    it('is untouched while both bundles are retained', async () => {
      const plan = await run([
        { bundleId: 'github.com/org/alpha', revisionId: alpha.revisionId },
        { bundleId: 'github.com/org/beta', revisionId: beta.revisionId },
      ]);

      expect(plan.reachableBlobs).toBe(3);
      expect(plan.unreferencedBlobs).toEqual([]);
      expect(plan.staleManifests).toEqual([]);
      expect(await storage.list('blobs/')).toHaveLength(3);
    });
  });

  it('keeps the blobs of a retained revision no channel points at', async () => {
    // Retention holds unpointed revisions back so a rollback has something to
    // roll back to. They are in the retained set precisely so their content
    // survives, which is why the collector asks the backend rather than
    // reading the bucket.
    const rollback = await publish({
      bundleId: 'github.com/org/alpha',
      label: 'old',
      bodies: ['# Old\n\nThe version someone may roll back to.\n'],
    });

    await run([
      { bundleId: 'github.com/org/alpha', revisionId: rollback.revisionId },
    ]);

    expect(await storage.has(rollback.blobs[0])).toBe(true);
  });

  describe('a dry run', () => {
    it('deletes nothing, whatever it reports', async () => {
      const orphan = await publish({
        bundleId: 'github.com/org/alpha',
        label: 'alpha',
        bodies: [SHARED, '# Alpha\n\nOnly alpha has this page.\n'],
      });

      const before = await storage.list('');
      const plan = await sweep([]);

      // Asserted against storage, not against the report: a plan that says
      // "nothing deleted" while having deleted is exactly the failure the
      // dry-run default exists to prevent.
      expect(await storage.list('')).toEqual(before);
      for (const key of orphan.blobs) {
        expect(await storage.has(key)).toBe(true);
      }
      expect(plan.unreferencedBlobs).toHaveLength(2);
      expect(plan.staleManifests).toHaveLength(1);
    });
  });

  it('leaves objects younger than the minimum age alone', async () => {
    // The window between a publish uploading its manifest and registering the
    // revision: real, unretained, and not garbage.
    await publish({
      bundleId: 'github.com/org/alpha',
      label: 'alpha',
      bodies: ['# Alpha\n\nJust uploaded, not yet registered.\n'],
    });

    const plan = await sweep([], 60_000);

    expect(plan.unreferencedBlobs).toEqual([]);
    expect(plan.staleManifests).toEqual([]);
    expect(plan.skippedRecent).toBe(2);
  });

  it('leaves objects it does not recognise alone', async () => {
    // Something else's file under `bundles/` is not this tool's to remove.
    await storage.put(
      'bundles/github.com/org/alpha/notes.txt',
      Buffer.from('hand-written', 'utf8'),
      'text/plain',
    );

    await run([]);

    expect(await storage.has('bundles/github.com/org/alpha/notes.txt')).toBe(
      true,
    );
  });

  it('counts the bundles and revisions it scanned', async () => {
    const alpha = await publish({
      bundleId: 'github.com/org/alpha',
      label: 'alpha',
      bodies: [SHARED],
    });
    const beta = await publish({
      bundleId: 'github.com/org/beta',
      label: 'beta',
      bodies: [SHARED],
    });

    const plan = await sweep([
      { bundleId: 'github.com/org/alpha', revisionId: alpha.revisionId },
      { bundleId: 'github.com/org/beta', revisionId: beta.revisionId },
    ]);

    expect(plan.bundles).toBe(2);
    expect(plan.revisions).toBe(2);
    expect(plan.reachableBlobs).toBe(1);
  });
});
