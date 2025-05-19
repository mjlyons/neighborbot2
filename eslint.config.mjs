// eslint.config.js

import eslint from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import nPlugin from 'eslint-plugin-n';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';
import pluginImport from 'eslint-plugin-import';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'package-lock.json'],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.d.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: globals.node,
    },
    plugins: {
      import: pluginImport,
      '@typescript-eslint': tseslint,
      n: nPlugin,
      prettier: prettierPlugin,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...nPlugin.configs.recommended.rules,
      'n/no-unpublished-import': ['error', { allowModules: ['vitest'] }],
      'prettier/prettier': 'error',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      // Use import "missing import" instead of n-plugin's
      'n/no-missing-import': 'off',
      'n/no-process-exit': 'off',
      'import/no-unresolved': 'error',
    },
  },
];
