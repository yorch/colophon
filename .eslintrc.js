/*
 * ESLint is deliberately scoped to ONE job in this repo: Backstage's
 * monorepo dependency-hygiene rules, which Biome has no equivalent for.
 *
 * All formatting and general linting is owned by Biome (see biome.json).
 * `plugin:@backstage/recommended` contains no style or formatting rules,
 * so the two tools cannot conflict. Do not add stylistic rules here.
 *
 * Run via `yarn lint:arch`.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  extends: ['plugin:@backstage/recommended'],
  ignorePatterns: [
    '**/dist/**',
    '**/dist-types/**',
    '**/node_modules/**',
    '**/*.d.ts',
  ],
};
