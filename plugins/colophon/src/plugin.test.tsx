import { colophonPlugin, colophonRouteRef } from './plugin';

/**
 * Verifies the plugin ASSEMBLES, which the component tests do not.
 *
 * Those render components directly and say nothing about whether the plugin
 * meant to deliver them can be built — and this one leans on two APIs that
 * moved: EntityContentBlueprint lives on plugin-catalog-react's /alpha
 * subpath, and NavItemBlueprint no longer exists at all, so the sidebar entry
 * comes from PageBlueprint's params instead. Both are the kind of thing that
 * type-checks against an installed version and then fails when the extension
 * is actually built.
 */
describe('the frontend plugin', () => {
  it('can be created', () => {
    // A blueprint given the wrong params throws while this module is built,
    // rather than at runtime in someone's portal.
    expect(colophonPlugin).toBeDefined();
    expect(colophonPlugin.id).toBe('colophon');
  });

  it('contributes the API client', () => {
    expect(colophonPlugin.getExtension('api:colophon/colophon')).toBeDefined();
  });

  it('attaches the documentation page to the app routes', () => {
    // Params are not exposed on a built extension, so the observable fact is
    // where it attaches: a routable page rather than a stray element.
    const page = colophonPlugin.getExtension('page:colophon/colophon');
    expect(JSON.stringify(page)).toContain('"id":"app/routes"');
  });

  it('declares a route ref for the docs page', () => {
    // The app discovers sidebar entries from page extensions and needs a
    // title, an icon AND a route ref to build one. Missing any of the three
    // leaves the page reachable by URL and absent from the nav, with nothing
    // logged — so the only way this stays true is to assert it.
    expect(colophonRouteRef).toBeDefined();
  });

  it('routes the docs page without a trailing wildcard', () => {
    // A bundle id contains slashes, which invites writing `/colophon/*` here.
    // The router appends its own splat, so that nests one splat inside
    // another and the page 404s at every URL — including its own root.
    const page = colophonPlugin.getExtension('page:colophon/colophon');
    expect(JSON.stringify(page)).not.toContain('/colophon/*');
  });

  it('contributes an entity documentation tab', () => {
    // Built against the wrong package, EntityContentBlueprint would not
    // produce an entity-content extension at all.
    const tab = colophonPlugin.getExtension('entity-content:colophon/colophon');
    expect(JSON.stringify(tab)).toContain('entity-content');
  });
});
