/*
 * Timestamps are stored as ISO-8601 UTC text rather than a native timestamp
 * type. The manifest already guarantees a canonical `...Z` string, text sorts
 * lexicographically in exactly that order, and it survives the round trip
 * through SQLite and Postgres identically — a native column does not.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('colophon_revisions', table => {
    table.comment('An immutable published snapshot of a documentation bundle');
    table.string('revision_id', 64).primary().notNullable();
    table.string('bundle_id', 512).notNullable().index();
    table.string('created_at', 32).notNullable();
    table.text('source_url').notNullable();
    table.text('source_ref').notNullable();
    table.text('source_commit').notNullable();
    table.text('title').notNullable();
    table.text('description').nullable();
    table.text('manifest').notNullable();
    table
      .string('indexed_at', 32)
      .nullable()
      .comment('Set once chunks exist; null means never indexed');
    table.index(['bundle_id', 'created_at'], 'colophon_revisions_bundle_age');
  });

  await knex.schema.createTable('colophon_channels', table => {
    table.comment('Mutable named pointers into a bundle history');
    table.string('bundle_id', 512).notNullable();
    table.string('channel', 64).notNullable();
    table
      .string('revision_id', 64)
      .notNullable()
      .references('revision_id')
      .inTable('colophon_revisions');
    table.string('updated_at', 32).notNullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.primary(['bundle_id', 'channel']);
    table.index('revision_id', 'colophon_channels_revision');
  });

  await knex.schema.createTable('colophon_pages', table => {
    table.comment('The page index of a revision, mirrored from its manifest');
    table
      .string('revision_id', 64)
      .notNullable()
      .references('revision_id')
      .inTable('colophon_revisions')
      .onDelete('CASCADE');
    table.string('slug', 512).notNullable();
    table.text('title').notNullable();
    table.text('description').nullable();
    table.string('type', 32).nullable();
    table.string('status', 32).notNullable();
    table.text('tags').notNullable();
    table
      .text('tags_text')
      .notNullable()
      .comment('Pipe-delimited tags, e.g. "|api|billing|", for exact LIKE');
    table.string('content_hash', 64).notNullable();
    table.integer('nav_order').nullable();
    table.primary(['revision_id', 'slug']);
  });

  await knex.schema.createTable('colophon_chunks', table => {
    table.comment('Retrieval units derived from page bodies at index time');
    table.string('id', 64).primary().notNullable();
    table
      .string('revision_id', 64)
      .notNullable()
      .references('revision_id')
      .inTable('colophon_revisions')
      .onDelete('CASCADE');
    table.string('slug', 512).notNullable();
    table.string('anchor', 512).nullable();
    table.text('breadcrumb').notNullable();
    table
      .text('breadcrumb_text')
      .notNullable()
      .comment('Breadcrumb joined for search; weighted above the body');
    table.text('text').notNullable();
    table.integer('ordinal').notNullable();
    table.string('content_hash', 64).notNullable();
    table.index(['revision_id', 'slug', 'ordinal'], 'colophon_chunks_position');
  });

  await knex.schema.createTable('colophon_entity_links', table => {
    table.comment('Catalog entities that carry the Colophon annotation');
    table.string('entity_ref', 512).primary().notNullable();
    table.string('bundle_id', 512).notNullable().index();
    table
      .string('subpath', 512)
      .nullable()
      .comment('Slug prefix this entity is scoped to, for monorepo bundles');
  });

  if (knex.client.config.client.includes('pg')) {
    // Postgres gets a real inverted index. SQLite falls back to LIKE scoring
    // in the query layer, which is adequate for dev and test corpora.
    await knex.raw(`
      ALTER TABLE colophon_chunks
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(breadcrumb_text, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(text, '')), 'B')
      ) STORED
    `);
    await knex.raw(`
      CREATE INDEX colophon_chunks_search
      ON colophon_chunks USING GIN (search_vector)
    `);
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('colophon_entity_links');
  await knex.schema.dropTableIfExists('colophon_chunks');
  await knex.schema.dropTableIfExists('colophon_pages');
  await knex.schema.dropTableIfExists('colophon_channels');
  await knex.schema.dropTableIfExists('colophon_revisions');
};
