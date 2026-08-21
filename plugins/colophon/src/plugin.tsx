import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
// EntityContentBlueprint is exposed only on the /alpha subpath of
// plugin-catalog-react, and is marked @alpha upstream — a known upgrade
// checkpoint rather than a stable import.
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { isColophonAvailable } from './annotation';
import { ColophonClient, colophonApiRef } from './api';

const colophonApi = ApiBlueprint.make({
  name: 'colophon',
  params: define =>
    define({
      api: colophonApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: deps => new ColophonClient(deps),
    }),
});

const colophonEntityContent = EntityContentBlueprint.make({
  name: 'colophon',
  params: {
    path: 'docs',
    title: 'Docs',
    filter: isColophonAvailable,
    loader: () =>
      import('./components/EntityColophonContent').then(m => (
        <m.EntityColophonContent />
      )),
  },
});

/**
 * The docs home page.
 *
 * `title` and `icon` here are what produce the sidebar entry: NavItemBlueprint
 * was removed in frontend-plugin-api 0.17, and nav items are now inferred
 * from page extensions.
 */
const colophonPage = PageBlueprint.make({
  name: 'colophon',
  params: {
    // Trailing wildcard: the page itself routes `/colophon/<bundleId>`,
    // where `<bundleId>` is a slash-separated path of its own.
    path: '/colophon/*',
    title: 'Docs',
    loader: () =>
      import('./components/DocsHomePage').then(m => <m.DocsHomePage />),
  },
});

export const colophonPlugin = createFrontendPlugin({
  pluginId: 'colophon',
  extensions: [colophonApi, colophonEntityContent, colophonPage],
});
