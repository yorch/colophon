import {
  ApiBlueprint,
  createFrontendPlugin,
  createRouteRef,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
// EntityContentBlueprint is exposed only on the /alpha subpath of
// plugin-catalog-react, and is marked @alpha upstream — a known upgrade
// checkpoint rather than a stable import.
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
// Both search blueprints are @alpha upstream, like EntityContentBlueprint —
// another known upgrade checkpoint.
import {
  SearchFilterResultTypeBlueprint,
  SearchResultListItemBlueprint,
} from '@backstage/plugin-search-react/alpha';
import { COLOPHON_DOCUMENT_TYPE } from '@brnby/colophon-common';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import { isColophonAvailable } from './annotation';
import { ColophonClient, colophonApiRef } from './api';

/**
 * The docs home page's route.
 *
 * Needed for more than deep links: the app builds its sidebar by discovering
 * page extensions that carry a title, an icon AND a route ref, so a page
 * without one is reachable by URL and invisible in the nav.
 */
export const colophonRouteRef = createRouteRef();

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
 * The docs home page, and the sidebar entry that reaches it.
 *
 * NavItemBlueprint was removed in frontend-plugin-api 0.17; the app now
 * discovers nav items from page extensions, and it needs all THREE of
 * `title`, `icon` and `routeRef` to build one (see NavContentNavItem in
 * @backstage/plugin-app-react). Any one of them missing and the page is still
 * reachable by URL but absent from the nav, silently — nothing warns, because
 * a page without a nav entry is a legitimate thing to want.
 *
 * `path` carries no trailing wildcard even though the page routes
 * `/colophon/<bundleId>` and a bundle id contains slashes. The router appends
 * its own splat, so writing one here nests a second splat inside the first,
 * which nothing matches — the page 404'd at every URL.
 */
const colophonPage = PageBlueprint.make({
  name: 'colophon',
  params: {
    path: '/colophon',
    title: 'Docs',
    icon: <MenuBookIcon />,
    routeRef: colophonRouteRef,
    loader: () =>
      import('./components/DocsHomePage').then(m => <m.DocsHomePage />),
  },
});

/**
 * Documentation as a first-class result type in portal search.
 *
 * Two extensions because they answer two different questions. The filter is
 * what puts "Documentation" beside "Software Catalog" in the result-type
 * panel — without it, docs are searchable but cannot be searched FOR, since
 * there is no way to narrow to them. The list item is what renders a hit as
 * a section of a page rather than an anonymous blob of text.
 */
const colophonSearchResultType = SearchFilterResultTypeBlueprint.make({
  name: 'colophon',
  params: {
    value: COLOPHON_DOCUMENT_TYPE,
    name: 'Documentation',
    icon: <MenuBookIcon />,
  },
});

const colophonSearchResultItem = SearchResultListItemBlueprint.make({
  name: 'colophon',
  params: {
    // Scoped by predicate: without one the blueprint renders EVERY result
    // type, so catalog entities would be drawn by the documentation renderer.
    predicate: result => result.type === COLOPHON_DOCUMENT_TYPE,
    icon: <MenuBookIcon />,
    component: async () => {
      const { ColophonSearchResultItem } = await import(
        './components/ColophonSearchResultItem'
      );
      return ColophonSearchResultItem;
    },
  },
});

export const colophonPlugin = createFrontendPlugin({
  pluginId: 'colophon',
  extensions: [
    colophonApi,
    colophonEntityContent,
    colophonPage,
    colophonSearchResultType,
    colophonSearchResultItem,
  ],
});
