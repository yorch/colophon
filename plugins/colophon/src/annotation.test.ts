import type { Entity } from '@backstage/catalog-model';
import {
  isColophonAvailable,
  isWithinSubpath,
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

describe('isWithinSubpath', () => {
  it('admits everything when no subpath is set', () => {
    expect(isWithinSubpath('anything/at/all')).toBe(true);
  });

  it('admits the subpath root itself', () => {
    expect(isWithinSubpath('services/billing', 'services/billing')).toBe(true);
  });

  it('admits a descendant', () => {
    expect(isWithinSubpath('services/billing/api', 'services/billing')).toBe(
      true,
    );
  });

  it('rejects a sibling that merely shares a prefix', () => {
    // Matching on the segment boundary is what keeps services/billing from
    // also claiming services/billing-v2.
    expect(isWithinSubpath('services/billing-v2', 'services/billing')).toBe(
      false,
    );
  });

  it('rejects an unrelated page', () => {
    expect(isWithinSubpath('guides/deploy', 'services/billing')).toBe(false);
  });
});
