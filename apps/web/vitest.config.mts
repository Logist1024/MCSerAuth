import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Keep the cache inside this workspace package: `pnpm -r test` runs server
  // and web in parallel, and a shared cache directory races (ENOTEMPTY).
  cacheDir: fileURLToPath(new URL('./node_modules/.vitest-cache', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/http.ts', 'lib/errors.ts', 'lib/format.ts', 'lib/categories.ts'],
    },
  },
});
