import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import colophonPlugin from '@brnby/plugin-colophon';
import { signInModule } from './signIn';

/**
 * Features are listed explicitly rather than discovered.
 *
 * An app normally finds its plugins by scanning dependencies for the
 * `"backstage": "@backstage/FrontendPlugin"` export condition. Naming them
 * here means this harness fails loudly if a plugin cannot be built, instead
 * of quietly rendering an app with one fewer feature than intended — which is
 * exactly the failure a harness exists to catch.
 */
const app = createApp({
  features: [catalogPlugin, searchPlugin, colophonPlugin, signInModule],
});

export default app.createRoot();
