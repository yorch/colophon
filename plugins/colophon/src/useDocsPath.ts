import { useRouteRef } from '@backstage/frontend-plugin-api';
import { colophonRouteRef } from './plugin';

/**
 * Where the docs home page is mounted, which the adopter chooses.
 *
 * PageBlueprint takes `path` from config, so an app is free to mount the docs
 * home at `/handbook`. Links used to spell `/colophon` out, and every one of
 * them 404'd for such an app — the page rendered fine, so nothing failed until
 * something was clicked. The route ref is the only thing that knows the
 * configured path.
 *
 * `useRouteRef` returns undefined when the ref is bound to no route at all,
 * which for the page that owns the ref means it is not mounted in an app —
 * a bare unit test, not a deployment. Components that render outside the
 * docs page (the entity tab) get the same answer and must treat the empty
 * string as "no docs home to link to".
 */
export function useDocsPath(): string {
  return useRouteRef(colophonRouteRef)?.() ?? '';
}
