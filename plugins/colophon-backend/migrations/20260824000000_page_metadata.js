/*
 * Custom frontmatter, mirrored alongside the rest of the page index.
 *
 * The manifest is stored whole on the revision row, so the passthrough would
 * survive a round trip without this column — but nothing reads pages from
 * there. `getPage` and `listPages` read `colophon_pages`, which is what the
 * MCP actions answer from, so a page's custom keys have to be on the row or
 * an agent never sees them.
 *
 * Nullable with no default, so the migration is a pure add: every row already
 * written stays valid and reads back as "no custom keys", which is the truth
 * for a bundle published before this shipped.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('colophon_pages', table => {
    table
      .text('metadata')
      .nullable()
      .comment('JSON object of frontmatter keys Colophon does not define');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('colophon_pages', table => {
    table.dropColumn('metadata');
  });
};
