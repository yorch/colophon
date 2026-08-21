/**
 * Deterministic JSON, so that publishing the same content twice produces the
 * same revision id.
 *
 * This is load-bearing rather than cosmetic: the revision id is the sha-256
 * of this output, and idempotent publishing is what stops a retried CI run
 * from accumulating duplicate history. Key order in a JavaScript object
 * follows insertion order, so two runs that build a manifest by different
 * code paths would otherwise serialise differently and hash differently
 * despite describing identical documentation.
 *
 * Array order is preserved, never sorted — page and nav order carry meaning.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    // Sorted so the serialisation depends on content, not construction order.
    for (const key of Object.keys(source).sort()) {
      // Dropping undefined matches JSON.stringify, so an explicitly-undefined
      // optional field hashes the same as an absent one.
      if (source[key] !== undefined) {
        result[key] = canonicalValue(source[key]);
      }
    }
    return result;
  }
  return value;
}
