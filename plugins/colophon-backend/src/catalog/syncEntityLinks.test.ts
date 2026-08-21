import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { COLOPHON_ANNOTATION } from '@brnby/colophon-common';
import type { ColophonDatabase } from '../database';
import { syncEntityLinks } from './syncEntityLinks';

function entity(name: string, annotation?: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      namespace: 'default',
      ...(annotation
        ? { annotations: { [COLOPHON_ANNOTATION]: annotation } }
        : {}),
    },
  };
}

/**
 * A catalog that answers the two questions the sync asks: "which entities are
 * annotated" and "are there any entities at all". They are separate calls on
 * purpose, so the stub keeps them separate too — collapsing them would hide
 * exactly the distinction under test.
 */
function catalogStub(options: { annotated: Entity[]; total?: number }) {
  const calls: unknown[] = [];
  const catalog = {
    getEntities: jest.fn(async (request: { limit?: number }) => {
      calls.push(request);
      // The second call asks for one entity of any kind; the first filters on
      // the annotation.
      if (request.limit === 1) {
        const total = options.total ?? options.annotated.length;
        return { items: total > 0 ? [entity('anything')] : [] };
      }
      return { items: options.annotated };
    }),
  };
  return { catalog: catalog as unknown as CatalogService, calls };
}

function dbStub() {
  return {
    replaceEntityLinks: jest.fn(async () => {}),
  } as unknown as ColophonDatabase & {
    replaceEntityLinks: jest.Mock;
  };
}

const auth = mockServices.auth();

describe('entity link sync', () => {
  it('replaces the table with the annotated entities', async () => {
    const db = dbStub();
    const { catalog } = catalogStub({
      annotated: [
        entity('web', 'example.com/repo'),
        entity('api', 'example.com/repo#services/api'),
      ],
    });

    const result = await syncEntityLinks({
      catalog,
      db,
      auth,
      logger: mockServices.logger.mock(),
    });

    expect(result).toEqual({ linked: 2, skipped: 0 });
    expect(db.replaceEntityLinks).toHaveBeenCalledWith([
      {
        entityRef: 'component:default/web',
        bundleId: 'example.com/repo',
        subpath: undefined,
      },
      {
        entityRef: 'component:default/api',
        bundleId: 'example.com/repo',
        subpath: 'services/api',
      },
    ]);
  });

  it('skips one malformed annotation rather than the whole pass', async () => {
    const db = dbStub();
    const { catalog } = catalogStub({
      annotated: [
        entity('bad', 'not a bundle ref!!'),
        entity('good', 'a.com/b'),
      ],
    });

    const result = await syncEntityLinks({
      catalog,
      db,
      auth,
      logger: mockServices.logger.mock(),
    });

    expect(result).toEqual({ linked: 1, skipped: 1 });
    expect(db.replaceEntityLinks).toHaveBeenCalledWith([
      expect.objectContaining({ entityRef: 'component:default/good' }),
    ]);
  });

  it('clears the table when the catalog genuinely has no annotations', async () => {
    // The catalog is up and has entities; none carry the annotation. That IS
    // the truth, and stale links must not survive it.
    const db = dbStub();
    const { catalog } = catalogStub({ annotated: [], total: 5 });

    const result = await syncEntityLinks({
      catalog,
      db,
      auth,
      logger: mockServices.logger.mock(),
    });

    expect(result).toEqual({ linked: 0, skipped: 0 });
    expect(db.replaceEntityLinks).toHaveBeenCalledWith([]);
  });

  it('keeps the existing links when the catalog returns nothing at all', async () => {
    // A catalog mid-refresh, or one that cannot see these credentials, is
    // indistinguishable from "no entity is annotated" in the first response.
    // Clearing on that reading unlinks EVERY bundle in the deployment — and an
    // unlinked bundle skips the catalog visibility gate, so a transient fault
    // would quietly widen access until a later pass repaired it.
    const db = dbStub();
    const { catalog } = catalogStub({ annotated: [], total: 0 });
    const logger = mockServices.logger.mock();

    const result = await syncEntityLinks({ catalog, db, auth, logger });

    expect(result).toEqual({ linked: 0, skipped: 0 });
    expect(db.replaceEntityLinks).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no entities at all'),
    );
  });

  it('abandons the write when the scheduler aborts the pass', async () => {
    // The scheduler's timeout releases the task ticket, so another worker can
    // claim it while this pass is still in flight. Whichever finishes last
    // wins the table — so the aborted one must not be a writer at all.
    const db = dbStub();
    const { catalog } = catalogStub({ annotated: [entity('web', 'a.com/b')] });

    const result = await syncEntityLinks({
      catalog,
      db,
      auth,
      logger: mockServices.logger.mock(),
      abortSignal: AbortSignal.abort(),
    });

    expect(result).toEqual({ linked: 0, skipped: 0 });
    expect(db.replaceEntityLinks).not.toHaveBeenCalled();
  });
});
