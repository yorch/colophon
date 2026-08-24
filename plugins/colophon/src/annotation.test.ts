import type { Entity } from '@backstage/catalog-model';
import { ConfigReader } from '@backstage/config';
import {
  isColophonAvailable,
  readAnnotationKey,
  readBundleRef,
} from './annotation';

function entity(annotation?: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'payments-api',
      ...(annotation
        ? { annotations: { 'brnby.io/colophon': annotation } }
        : {}),
    },
  };
}

describe('readBundleRef', () => {
  it('reads a bare bundle id', () => {
    expect(readBundleRef(entity('github.com/brnby/api'))).toEqual({
      bundleId: 'github.com/brnby/api',
    });
  });

  it('reads the subpath form used by shared monorepo docs', () => {
    expect(
      readBundleRef(entity('github.com/brnby/platform#services/billing')),
    ).toEqual({
      bundleId: 'github.com/brnby/platform',
      subpath: 'services/billing',
    });
  });

  it('returns undefined when the annotation is absent', () => {
    expect(readBundleRef(entity())).toBeUndefined();
  });

  it('returns undefined for a blank annotation', () => {
    expect(readBundleRef(entity('   '))).toBeUndefined();
  });

  it('returns undefined rather than throwing on a malformed value', () => {
    // A typo in one entity's YAML should hide that entity's docs tab, not
    // break the catalog page it sits on.
    expect(readBundleRef(entity('GitHub.com/UPPER'))).toBeUndefined();
    expect(readBundleRef(entity('a#b#c'))).toBeUndefined();
  });
});

describe('isColophonAvailable', () => {
  it.each([
    ['a valid annotation', 'github.com/brnby/api', true],
    ['a malformed annotation', 'NOT VALID', false],
    ['no annotation', undefined, false],
  ])('is %s -> %s', (_name, annotation, expected) => {
    expect(isColophonAvailable(entity(annotation))).toBe(expected);
  });
});

/**
 * The frontend half of `colophon.annotation`. It has to agree with the
 * backend's `readColophonConfig`, including on what a blank value means —
 * an annotation named "" matches nothing, so honouring it would hide every
 * documentation tab in the portal with nothing logged.
 */
describe('readAnnotationKey', () => {
  const read = (colophon?: object) =>
    readAnnotationKey(new ConfigReader(colophon ? { colophon } : {}));

  it('defaults to the contract constant', () => {
    expect(read()).toBe('brnby.io/colophon');
  });

  it('returns the configured key', () => {
    expect(read({ annotation: 'acme.example.com/docs' })).toBe(
      'acme.example.com/docs',
    );
  });

  it('treats a whitespace-only key as unset', () => {
    expect(read({ annotation: '   ' })).toBe('brnby.io/colophon');
  });

  it('lets the config reader reject an empty key rather than masking it', () => {
    // `getOptionalString` throws on '' rather than returning it, and that
    // error names the key — which is a better answer than quietly falling
    // back, because an operator who wrote `annotation: ""` meant something.
    expect(() => read({ annotation: '' })).toThrow(/colophon.annotation/);
  });

  it('reads the key the entity is then looked up under', () => {
    // The two halves have to move together: a configured key that nothing
    // looks the entity up under is the same bug as no key at all.
    const key = read({ annotation: 'acme.example.com/docs' });
    const subject: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'payments-api',
        annotations: { 'acme.example.com/docs': 'github.com/brnby/api' },
      },
    };

    expect(readBundleRef(subject, key)?.bundleId).toBe('github.com/brnby/api');
    // ...and the default key must NOT find it, or the test proves nothing.
    expect(readBundleRef(subject)).toBeUndefined();
  });
});
