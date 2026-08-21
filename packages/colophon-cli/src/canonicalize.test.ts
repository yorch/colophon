import { canonicalize } from './canonicalize';

describe('canonicalize', () => {
  it('is independent of key insertion order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('sorts keys at every depth', () => {
    const one = { outer: { z: 1, a: { y: 2, b: 3 } } };
    const two = { outer: { a: { b: 3, y: 2 }, z: 1 } };
    expect(canonicalize(one)).toBe(canonicalize(two));
  });

  it('preserves array order, because page and nav order carry meaning', () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
  });

  it('sorts keys inside array elements', () => {
    expect(canonicalize([{ b: 1, a: 2 }])).toBe(canonicalize([{ a: 2, b: 1 }]));
  });

  it('treats an explicitly undefined field as absent, matching JSON', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });

  it('keeps null, which is a value rather than an absence', () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });

  it('distinguishes content, so different docs never collide', () => {
    expect(canonicalize({ title: 'A' })).not.toBe(canonicalize({ title: 'B' }));
  });

  it('is stable across repeated calls', () => {
    const value = { z: [3, 1], a: { c: true, b: 'x' } };
    expect(canonicalize(value)).toBe(canonicalize(value));
  });
});
