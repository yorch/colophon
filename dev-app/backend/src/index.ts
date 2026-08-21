/**
 * A local Backstage backend, for exercising Colophon against a real catalog.
 *
 * Every other test in this repository constructs pieces directly or boots the
 * plugin with `startTestBackend`. Neither says whether the plugin behaves in a
 * DEPLOYMENT: whether the catalog it reads is the same catalog the frontend
 * sees, whether the search collator's HTTP hop actually resolves, whether a
 * relative link in a published page survives the round trip to a browser.
 * Those only fail with everything running at once.
 *
 * Not published, not a template. Copy `app-config.colophon.yaml` into a real
 * app instead — this file exists to be run, not imitated.
 */
import { createBackend } from '@backstage/backend-defaults';
import { searchModuleColophonCollator } from '@brnby/plugin-colophon-backend';

const backend = createBackend();

// Serves the built frontend bundle, so the whole app is one origin in dev and
// the browser never has to be told about CORS.
backend.add(import('@backstage/plugin-app-backend'));

backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));

backend.add(import('@backstage/plugin-catalog-backend'));

backend.add(import('@backstage/plugin-search-backend'));
backend.add(import('@backstage/plugin-search-backend-module-catalog'));

backend.add(import('@brnby/plugin-colophon-backend'));
// The collator is a separate module because portal-wide search is opt-in. It
// is the piece least covered by unit tests: it reaches the corpus over HTTP
// precisely because plugin databases are scoped per plugin, and that hop
// cannot be exercised without a running backend.
backend.add(searchModuleColophonCollator);

backend.start();
