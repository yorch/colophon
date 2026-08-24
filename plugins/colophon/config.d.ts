/**
 * Colophon's app-config surface, frontend half.
 *
 * `colophon.appPath` is declared HERE as well as in
 * `plugins/colophon-backend/config.d.ts`, and the duplication is load-bearing
 * rather than an oversight. Backstage collects config schemas from a package's
 * own dependency closure, and the two halves of Colophon have different ones:
 * a frontend app depends on this package and not on the backend plugin, so the
 * backend's declaration is simply not in scope when the app's config is
 * filtered for the browser. With only that declaration the key reached the
 * dev server, was treated as undeclared, and was stripped — the browser then
 * read the default and reported drift against a correct configuration.
 *
 * `@visibility frontend` in both, therefore: the visibilities are merged and
 * a disagreement between them is a startup error, so these two blocks cannot
 * quietly diverge.
 */
export interface Config {
  colophon?: {
    /**
     * Where the docs home page is mounted. Must match the `path` of the
     * `page:colophon/colophon` extension.
     *
     * The frontend does not route by this — it resolves its own links through
     * the plugin's route ref. It reads the value only to compare the two and
     * warn when they disagree, because the backend has no router and builds
     * every search result link and every agent-facing URL from this key.
     *
     * @visibility frontend
     * @default "/colophon"
     */
    appPath?: string;

    /**
     * The catalog annotation that links an entity to a documentation bundle.
     *
     * Declared here for the same reason `appPath` is: a frontend app depends
     * on this package and not on the backend plugin, so the backend's
     * declaration is out of scope when config is filtered for the browser,
     * and the key would be stripped before it ever reached the entity tab.
     *
     * The tab's VISIBILITY is a separate lever — `EntityContentBlueprint`
     * takes a `filter` from app-config — but the tab's contents read the
     * annotation off the entity, so both have to name the same key.
     *
     * @visibility frontend
     * @default "brnby.io/colophon"
     */
    annotation?: string;
  };
}
