import { beforeEach, afterEach, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

import { createE2eContext, type E2eContext } from '../helpers/e2e.js';

let ctx: E2eContext;

beforeEach(async () => {
  ctx = await createE2eContext();
});

afterEach(async () => {
  await ctx.close();
});

test('the production-identical assembly serves health and envelope endpoints', async () => {
  // /health* is excluded from the /api prefix by the shared factory.
  const live = await ctx.request().get('/health/live');
  expect(live.status).toBe(200);

  const ready = await ctx.request().get('/health/ready');
  expect(ready.status).toBe(200);
  expect(ready.body.data.checks.database).toBe('up');

  // Forum categories are seeded by ForumCategoryService.onModuleInit at boot.
  const categories = await ctx.request().get('/api/forum/categories');
  expect(categories.status).toBe(200);
  expect(categories.body.code).toBe(0);
  expect(categories.body.data.length).toBeGreaterThan(0);
});
