import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', 'apps/web/public/**', '**/serverless-dist/**', 'apps/api/api/**', 'apps/api/serverless/**', '**/node_modules/**', 'supabase/**', 'docs/prototypes/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['apps/web/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  {
    // Records from the API are dynamic table rows, so the website pages handle them as untyped rows.
    files: ['apps/admin/src/**', 'apps/web/src/**', 'apps/api/src/admin/admin.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', 'scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
  prettier,
);
