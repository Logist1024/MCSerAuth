import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // better-sqlite3 is a native module; forks keep each test file isolated.
    pool: 'forks',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/swagger.ts',
        'src/**/*.module.ts',
        'src/**/*.controller.ts',
        'src/db/schema/**',
        'src/scripts/**',
      ],
    },
  },
});
