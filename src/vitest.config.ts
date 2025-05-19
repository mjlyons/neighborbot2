import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/*.test-helper.ts', '**/*.test-utils.ts', 'node_modules/**'],
    testTimeout: 100,
  },
});
