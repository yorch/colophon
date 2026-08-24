import { mockServices } from '@backstage/backend-test-utils';
import knexFactory, { type Knex } from 'knex';
import { LocalBundleStorage } from '../storage/LocalBundleStorage';
import { createColophonService } from './createColophonService';

/**
 * How the service decides which store to use.
 *
 * `storage` is optional here, and an optional parameter with a fallback is
 * how a caller's bug becomes a misleading error. The plugin ALWAYS passes a
 * store; the fallback exists only for a caller assembling the service by hand.
 * Telling those two cases apart is the whole of this file.
 */
describe('createColophonService', () => {
  let knex: Knex;

  beforeEach(() => {
    knex = knexFactory({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
    });
  });

  afterEach(async () => {
    await knex.destroy();
  });

  const build = (storage?: { storage?: undefined }) =>
    createColophonService({
      config: mockServices.rootConfig({
        data: {
          app: { baseUrl: 'http://localhost:3000' },
          backend: { baseUrl: 'http://localhost:7007' },
          colophon: { storage: { type: 'local' } },
        },
      }),
      database: mockServices.database({ knex }),
      logger: mockServices.logger.mock(),
      ...storage,
    });

  it('resolves from the built-ins when no storage is given at all', async () => {
    // The documented behaviour for a hand-assembled service: there are no
    // modules to have registered anything, so the built-ins are all there is.
    const service = await build();
    expect(service).toBeDefined();
  });

  it('refuses an explicitly absent storage instead of rebuilding', async () => {
    // This used to be `options.storage ?? createBundleStorage(options)`, which
    // answered a caller's bug by discarding the registry its modules had
    // filled and re-resolving from a BUILT-INS-ONLY one — so an operator whose
    // module registered `azure` was told the registered types were "local",
    // "s3" and to register the thing they had already registered.
    await expect(build({ storage: undefined })).rejects.toThrow(
      'The storage given to createColophonService did not produce a BundleStorage: has() is missing',
    );
  });

  it('uses the store it is given', async () => {
    const storage = new LocalBundleStorage('./nowhere');
    const service = await createColophonService({
      config: mockServices.rootConfig({
        data: {
          app: { baseUrl: 'http://localhost:3000' },
          backend: { baseUrl: 'http://localhost:7007' },
          // Deliberately a type no built-in registry could resolve: if the
          // given store were ignored for any reason, this would throw.
          colophon: { storage: { type: 'azure' } },
        },
      }),
      database: mockServices.database({ knex }),
      logger: mockServices.logger.mock(),
      storage,
    });
    expect(service).toBeDefined();
  });
});
