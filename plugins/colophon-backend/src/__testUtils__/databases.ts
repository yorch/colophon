import knexFactory, { type Knex } from 'knex';

/**
 * Backends a suite should run against.
 *
 * SQLite always, because it is what `yarn test` uses locally and in the
 * default CI job. Postgres only when a connection string is supplied — the
 * production full-text path is Postgres-only (tsvector, ts_rank, GIN), so
 * without this it ships entirely unexercised. CI provides the connection via
 * a service container.
 */
const POSTGRES_ENV_KEYS = [
  'BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING',
  'BACKSTAGE_TEST_DATABASE_POSTGRES17_CONNECTION_STRING',
  'BACKSTAGE_TEST_DATABASE_POSTGRES16_CONNECTION_STRING',
];

export function postgresConnectionString(): string | undefined {
  for (const key of POSTGRES_ENV_KEYS) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }
  return undefined;
}

export interface TestBackend {
  name: string;
  /** A fresh, isolated database. Callers must destroy it. */
  connect(): Promise<Knex>;
}

let schemaCounter = 0;

export function testBackends(): TestBackend[] {
  const backends: TestBackend[] = [
    {
      name: 'sqlite',
      connect: async () =>
        knexFactory({
          client: 'better-sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        }),
    },
  ];

  const connection = postgresConnectionString();
  if (connection) {
    backends.push({
      name: 'postgres',
      connect: async () => {
        // A schema per connection rather than a database per connection:
        // cheaper to create, and it isolates concurrent Jest workers without
        // needing CREATE DATABASE privileges.
        const schema = `colophon_test_${process.pid}_${schemaCounter++}`;
        const admin = knexFactory({ client: 'pg', connection });
        await admin.raw(`CREATE SCHEMA IF NOT EXISTS ??`, [schema]);
        await admin.destroy();
        return knexFactory({
          client: 'pg',
          connection,
          searchPath: [schema],
          pool: { min: 0, max: 3 },
        });
      },
    });
  }

  return backends;
}

/**
 * Runs `body` once per available backend.
 *
 * Named so a failure report says which backend failed, because the two take
 * genuinely different code paths through the search layer.
 */
export function describeEachBackend(
  title: string,
  body: (backend: TestBackend) => void,
): void {
  for (const backend of testBackends()) {
    describe(`${title} [${backend.name}]`, () => body(backend));
  }
}
