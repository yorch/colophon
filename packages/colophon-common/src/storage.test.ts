import { blobKey, bundleKey, manifestKey, revisionKey } from './storage';

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
