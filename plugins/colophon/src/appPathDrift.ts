import {
  configApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { DEFAULT_APP_PATH, normalizeAppPath } from '@brnby/colophon-common';
import { useEffect } from 'react';
import { colophonRouteRef } from './plugin';

/**
 * Says out loud when `colophon.appPath` no longer matches where the page is.
 *
 * The frontend resolves its own links through the route ref and is therefore
 * correct wherever the page is mounted. The backend cannot: it has no router,
 * so it builds every search result location and every URL an agent is handed
 * from `colophon.appPath` instead. Move the page and leave the key behind and
 * nothing errors — the portal works, and every link arriving from search or
 * from an agent 404s.
 *
 * That is the failure this project keeps paying for, so the second copy of a
 * value announces its own drift rather than waiting to be clicked. In the
 * console rather than on the page, because it is a misconfiguration an
 * operator fixes, not something the reader of a docs page can act on.
 */
export function useAppPathDriftWarning(): void {
  const config = useApi(configApiRef);
  // Undefined when the ref is bound to no route, which for the page that owns
  // it means no app at all — a bare unit test, where there is no drift to
  // report because there is no mount.
  const mountedAt = useRouteRef(colophonRouteRef)?.();
  const configured = normalizeAppPath(
    config.getOptionalString('colophon.appPath') ?? DEFAULT_APP_PATH,
  );

  useEffect(() => {
    if (mountedAt === undefined) {
      return;
    }
    const routed = normalizeAppPath(mountedAt);
    if (routed === configured) {
      return;
    }
    console.warn(
      `Colophon: the docs page is mounted at "${routed}" but colophon.appPath ` +
        `is "${configured}". The backend builds search result links and every ` +
        `URL it gives an agent from colophon.appPath, so all of them will 404 ` +
        `until it is set to "${routed}" in app-config.yaml.`,
    );
  }, [mountedAt, configured]);
}
