// Lint for the browser modules and build scripts. The main goal: catch
// names that are used but never imported (no-undef) — with ES modules
// those only fail at runtime, when that code path runs.
import globals from 'globals';

export default [
  {
    files: ['public/js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none' }] },
  },
];
