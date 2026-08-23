import { DEFAULT_APP_PATH, normalizeAppPath } from './appPath';

/**
 * The whole point of this function is that the backend's idea of the mount
 * path and the frontend's have to compare equal when they mean the same
 * thing. So the cases that matter are the spellings a person types by hand,
 * not the one the default already is.
 */
describe('normalizeAppPath', () => {
  it('accepts every spelling of the same mount', () => {
    for (const written of [
      '/handbook',
      'handbook',
      '/handbook/',
      'handbook/',
      '//handbook//',
      '  /handbook  ',
    ]) {
      expect(normalizeAppPath(written)).toBe('/handbook');
    }
  });

  it('keeps interior slashes, because a mount may be nested', () => {
    expect(normalizeAppPath('internal/docs/')).toBe('/internal/docs');
  });

  it('is idempotent, so a normalised value can be normalised again', () => {
    const once = normalizeAppPath('//handbook//');
    expect(normalizeAppPath(once)).toBe(once);
  });

  it('renders a root mount as the empty string, not as a bare slash', () => {
    // Callers append `/<bundleId>`, and '/' + '/x' is '//x' — a protocol-
    // relative URL, not a path.
    for (const written of ['', '/', '//', '   ']) {
      expect(normalizeAppPath(written)).toBe('');
    }
  });

  it('leaves the default alone', () => {
    expect(normalizeAppPath(DEFAULT_APP_PATH)).toBe(DEFAULT_APP_PATH);
  });
});
