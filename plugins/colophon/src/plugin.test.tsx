import { colophonPlugin } from './plugin';

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

  it('contributes an entity documentation tab', () => {
    // Built against the wrong package, EntityContentBlueprint would not
    // produce an entity-content extension at all.
    const tab = colophonPlugin.getExtension('entity-content:colophon/colophon');
    expect(JSON.stringify(tab)).toContain('entity-content');
  });
});
