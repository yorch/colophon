/**
 * Where the docs home page is mounted in the portal.
 *
 * The frontend can ask its router. The backend cannot — it has no router and
 * no way to discover the mount path — yet the backend is the half that writes
 * every search result location and every URL an agent is handed. So the path
 * travels as config, and this module is what keeps the two halves agreeing on
 * what a given spelling of it means: without one shared rule, `/handbook/` and
 * `/handbook` would read as a mismatch and the frontend's drift warning would
 * cry wolf over a correct configuration.
 */

/** What `PageBlueprint` mounts the page at when nothing overrides it. */
export const DEFAULT_APP_PATH = '/colophon';

/**
 * One leading slash, no trailing slash.
 *
 * An adopter setting this by hand writes `handbook`, `/handbook` and
 * `/handbook/` about equally often, and all three name the same mount.
 * The empty string is the app root, which is why this returns '' rather than
 * '/': every caller appends `/<something>`, and `//bundle` is a protocol-
 * relative URL rather than a path.
 */
export function normalizeAppPath(value: string): string {
  const trimmed = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `/${trimmed}` : '';
}
