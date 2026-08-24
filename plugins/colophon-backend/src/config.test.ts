import { mockServices } from '@backstage/backend-test-utils';
import { COLOPHON_ANNOTATION } from '@brnby/colophon-common';
import { DEFAULT_ENTITY_LINK_SCHEDULE, readColophonConfig } from './config';

const read = (colophon: object) =>
  readColophonConfig(
    mockServices.rootConfig({
      data: { app: { baseUrl: 'http://localhost:3000' }, colophon },
    }),
  );

/**
 * The schedule keys are a contract with `app-config.yaml`, and a unit that the
 * reader does not understand is not an error — it is dropped, and the default
 * quietly takes its place. `app-config.yaml` asked for `seconds: 30` and the
 * dev app ran the sync every ten minutes for exactly that reason, with nothing
 * logged. Asserting the returned object is the only way to see it.
 */
describe('readColophonConfig schedules', () => {
  it('honours sub-minute frequencies', () => {
    const { entityLinkSchedule } = read({
      schedule: {
        entityLinks: {
          frequency: { seconds: 30 },
          timeout: { minutes: 2 },
          initialDelay: { seconds: 5 },
        },
      },
    });

    expect(entityLinkSchedule.frequency).toEqual({ seconds: 30 });
    expect(entityLinkSchedule.timeout).toEqual({ minutes: 2 });
    expect(entityLinkSchedule.initialDelay).toEqual({ seconds: 5 });
  });

  it('accepts the other platform duration forms', () => {
    const { searchIndexSchedule } = read({
      schedule: {
        searchIndex: {
          frequency: { cron: '*/5 * * * *' },
          timeout: 'PT90S',
        },
      },
    });

    expect(searchIndexSchedule.frequency).toEqual({ cron: '*/5 * * * *' });
    expect(searchIndexSchedule.timeout).toEqual({ seconds: 90 });
  });

  it('falls back only when the task is not configured at all', () => {
    expect(read({}).entityLinkSchedule).toEqual(DEFAULT_ENTITY_LINK_SCHEDULE);
  });

  // Half a schedule is a mistake, and completing it from the defaults is how
  // the original bug hid.
  it('rejects a schedule missing its timeout', () => {
    expect(() =>
      read({ schedule: { entityLinks: { frequency: { seconds: 30 } } } }),
    ).toThrow(/timeout/);
  });
});

/**
 * The one config value the backend cannot check for itself: it has no router,
 * so a wrong `appPath` produces links that are well-formed and 404. Everything
 * downstream concatenates this value, so it has to arrive in one shape.
 */
describe('readColophonConfig appPath', () => {
  it('defaults to where PageBlueprint mounts the page', () => {
    expect(read({}).appPath).toBe('/colophon');
  });

  it('normalises whatever spelling the operator wrote', () => {
    for (const written of ['/handbook', 'handbook', '/handbook/']) {
      expect(read({ appPath: written }).appPath).toBe('/handbook');
    }
  });

  it('renders a root mount as the empty string, so links stay single-slashed', () => {
    expect(read({ appPath: '/' }).appPath).toBe('');
  });
});

/**
 * A key declared in the schema but never read is the failure this project has
 * already paid for once — `storage.local.directory` was documented, accepted,
 * and read under a different name, so publishes succeeded and reads 404'd
 * with nothing logged. These assert the read site, not the declaration.
 */
describe('readColophonConfig annotation', () => {
  it('defaults to the contract constant', () => {
    expect(read({}).annotation).toBe(COLOPHON_ANNOTATION);
  });

  it('returns the configured key', () => {
    expect(read({ annotation: 'acme.example.com/docs' }).annotation).toBe(
      'acme.example.com/docs',
    );
  });

  it('treats a blank key as unset rather than as a key', () => {
    // An annotation named "" or "   " matches no entity, so honouring it
    // would silently index nothing — the same shape of failure as above.
    expect(read({ annotation: '   ' }).annotation).toBe(COLOPHON_ANNOTATION);
  });
});
