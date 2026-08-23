import { mockServices } from '@backstage/backend-test-utils';
import { DEFAULT_ENTITY_LINK_SCHEDULE, readColophonConfig } from './config';

/**
 * The schedule keys are a contract with `app-config.yaml`, and a unit that the
 * reader does not understand is not an error — it is dropped, and the default
 * quietly takes its place. `app-config.yaml` asked for `seconds: 30` and the
 * dev app ran the sync every ten minutes for exactly that reason, with nothing
 * logged. Asserting the returned object is the only way to see it.
 */
describe('readColophonConfig schedules', () => {
  const read = (colophon: object) =>
    readColophonConfig(
      mockServices.rootConfig({
        data: { app: { baseUrl: 'http://localhost:3000' }, colophon },
      }),
    );

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
