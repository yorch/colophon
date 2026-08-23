import type { Manifest } from './manifest';
import {
  blobKey,
  bundleKey,
  manifestKey,
  parseManifestKey,
  referencedBlobKeys,
  revisionKey,
} from './storage';

const HASH = 'a'.repeat(64);
const REVISION = 'b'.repeat(64);
const BUNDLE = 'github.com/brnby/payments-api';

describe('storage keys', () => {
  it('fans blobs out by the first two hash characters', () => {
    expect(blobKey(HASH)).toBe(`blobs/aa/${HASH}`);
  });

  it('keeps bundle keys human-readable in a bucket browser', () => {
    expect(bundleKey(BUNDLE)).toBe('bundles/github.com/brnby/payments-api');
  });

  it('nests revisions under their bundle', () => {
    expect(revisionKey(BUNDLE, REVISION)).toBe(
      `bundles/${BUNDLE}/revisions/${REVISION}`,
    );
  });

  it('places the manifest inside the revision', () => {
    expect(manifestKey(BUNDLE, REVISION)).toBe(
      `${revisionKey(BUNDLE, REVISION)}/manifest.json`,
    );
  });

  it('gives identical content the same blob key across bundles', () => {
    // This is what makes retained history affordable — an unchanged page
    // shared by many revisions is stored exactly once.
    expect(blobKey(HASH)).toBe(blobKey(HASH));
  });
});

describe('parseManifestKey', () => {
  it('round-trips whatever manifestKey produced', () => {
    expect(parseManifestKey(manifestKey(BUNDLE, REVISION))).toEqual({
      bundleId: BUNDLE,
      revisionId: REVISION,
    });
  });

  it('reads a bundle id that itself contains a "revisions" segment', () => {
    // Bundle ids are path-like and unconstrained beyond their charset, so the
    // separator has to be found from the right. Splitting on the first match
    // would report the bundle as `org` and the revision as a path.
    const awkward = 'github.com/org/revisions';
    expect(parseManifestKey(manifestKey(awkward, REVISION))).toEqual({
      bundleId: awkward,
      revisionId: REVISION,
    });
  });

  it.each([
    ['a blob', blobKey(HASH)],
    ['a bundle prefix', bundleKey(BUNDLE)],
    ['a revision without its manifest', revisionKey(BUNDLE, REVISION)],
    ['something else entirely', 'bundles/org/repo/notes.txt'],
    [
      'a revision id that is not a hash',
      'bundles/org/repo/revisions/x/manifest.json',
    ],
  ])('returns undefined for %s', (_name, key) => {
    // Garbage collection deletes what it cannot attribute to a live
    // revision, so anything it fails to recognise must be left alone rather
    // than guessed at.
    expect(parseManifestKey(key)).toBeUndefined();
  });
});

describe('referencedBlobKeys', () => {
  it('covers pages and assets alike, deduplicated', () => {
    const shared = 'c'.repeat(64);
    const manifest = {
      pages: [{ contentHash: shared }, { contentHash: HASH }],
      assets: [{ contentHash: shared }],
    } as Manifest;

    // An asset class missed here is content a sweep would delete out from
    // under a published revision.
    expect(referencedBlobKeys(manifest)).toEqual(
      new Set([blobKey(shared), blobKey(HASH)]),
    );
  });
});
